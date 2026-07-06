"""Sandboxed multi-language code judge — Python port of functions/src/judge.js.

Used by both the Clash router (run/submit) and the Assessments router.
Spawns node/python3/javac+java/g++ as subprocesses in a per-submission temp
directory with a 6-second timeout, then compares stdout to the expected
output. The runner-harness strings below are intentionally byte-for-byte
equivalent to the Node version's embedded JS/Python/Java/C++ templates, so
behavior (and any of its quirks) carries over exactly.
"""
import asyncio
import json
import platform
import resource
import subprocess
import tempfile
from pathlib import Path
from typing import Any

SUPPORTED_LANGUAGES = {"javascript", "python", "java", "cpp"}
MAX_CODE_SIZE = 20000
RUN_TIMEOUT_SECONDS = 6

# Bonus (see Task 3 in the migration): best-effort per-process resource caps.
# Cloud Functions couldn't do this reliably because we didn't control the
# underlying container process tree; here we do, so we cap address space and
# CPU time on the spawned child via a preexec_fn. This is enforced by the
# Linux kernel in the Docker/Cloud Run container; on macOS dev machines
# RLIMIT_AS is frequently ignored by the kernel, so treat this as a
# container-primary safety net, not a cross-platform guarantee.
MAX_MEMORY_BYTES = 256 * 1024 * 1024  # 256 MiB
_IS_POSIX = platform.system() != "Windows"


def _limit_resources():
    try:
        resource.setrlimit(resource.RLIMIT_AS, (MAX_MEMORY_BYTES, MAX_MEMORY_BYTES))
    except (ValueError, OSError):
        pass
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (RUN_TIMEOUT_SECONDS, RUN_TIMEOUT_SECONDS))
    except (ValueError, OSError):
        pass


def parse_maybe_json(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return json.loads(value)
    except (json.JSONDecodeError, ValueError):
        return value


def normalize_input(raw_input: Any) -> list:
    parsed = parse_maybe_json(raw_input)
    return parsed if isinstance(parsed, list) else [parsed]


def normalize_expected(raw_expected: Any) -> Any:
    parsed = parse_maybe_json(raw_expected)
    if isinstance(parsed, str):
        return parsed.strip()
    return parsed


def compare_outputs(actual: Any, expected: Any) -> bool:
    if isinstance(actual, str) and isinstance(expected, str):
        return actual.strip() == expected.strip()
    return json.dumps(actual, sort_keys=True) == json.dumps(expected, sort_keys=True)


class ExecResult:
    def __init__(self, stdout: str, stderr: str, returncode: int, killed_by_timeout: bool):
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode
        self.killed_by_timeout = killed_by_timeout


def _run_process(command: list[str], env_extra: dict | None = None) -> ExecResult:
    import os

    env = {**os.environ, **(env_extra or {})}

    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            env=env,
            timeout=RUN_TIMEOUT_SECONDS,
            preexec_fn=_limit_resources if _IS_POSIX else None,
        )
        return ExecResult(completed.stdout, completed.stderr, completed.returncode, False)
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = exc.stderr.decode() if isinstance(exc.stderr, bytes) else (exc.stderr or "")
        return ExecResult(stdout, stderr, 1, True)
    except OSError as exc:
        return ExecResult("", str(exc), 1, False)


def _execute_javascript(code: str, test_input: list) -> ExecResult:
    with tempfile.TemporaryDirectory(prefix="judge-js-") as tmp_dir:
        runner_path = Path(tmp_dir) / "runner.js"
        runner_code = f"""\"use strict\";
{code}
(async () => {{
  if (typeof solution !== "function") {{
    throw new Error("Define a function named solution");
  }}
  const parsedInput = JSON.parse(process.env.JUDGE_INPUT_JSON || "[]");
  const args = Array.isArray(parsedInput) ? parsedInput : [parsedInput];
  const output = await solution(...args);
  process.stdout.write(JSON.stringify({{ output }}));
}})().catch((err) => {{
  process.stderr.write(err?.stack || err?.message || String(err));
  process.exit(1);
}});"""
        runner_path.write_text(runner_code, encoding="utf-8")
        return _run_process(["node", str(runner_path)], {"JUDGE_INPUT_JSON": json.dumps(test_input)})


def _execute_python(code: str, test_input: list) -> ExecResult:
    with tempfile.TemporaryDirectory(prefix="judge-py-") as tmp_dir:
        runner_path = Path(tmp_dir) / "runner.py"
        runner_code = f"""{code}
import json
import os
import traceback

try:
    if "solution" not in globals() or not callable(solution):
        raise Exception("Define a function named solution")

    parsed_input = json.loads(os.environ.get("JUDGE_INPUT_JSON", "[]"))
    if not isinstance(parsed_input, list):
        parsed_input = [parsed_input]
    output = solution(*parsed_input)
    print(json.dumps({{"output": output}}), end="")
except Exception:
    traceback.print_exc()
    raise
"""
        runner_path.write_text(runner_code, encoding="utf-8")
        return _run_process(["python3", str(runner_path)], {"JUDGE_INPUT_JSON": json.dumps(test_input)})


def _execute_java(code: str, test_input: list) -> ExecResult:
    with tempfile.TemporaryDirectory(prefix="judge-java-") as tmp_dir:
        # NOTE: the original Node judge.js wrote the user's `public class Solution`
        # and this harness's `public class Main` into a single file named
        # "Solution.java". That's illegal Java — a file may contain at most one
        # public top-level class, and it must match the filename — so the Node
        # version would fail to compile *any* submission using its own documented
        # starter code convention (`public class Solution { ... }`). Fixed here by
        # writing them as two separate files and compiling both, which is what
        # javac actually requires for multi-class-file compilation.
        solution_path = Path(tmp_dir) / "Solution.java"
        main_path = Path(tmp_dir) / "Main.java"

        solution_path.write_text(f"import java.util.Arrays;\n{code}\n", encoding="utf-8")

        main_code = """import java.util.Arrays;

public class Main {
  public static void main(String[] args) {
    try {
      String inputJson = System.getenv("JUDGE_INPUT_JSON");
      // Basic JSON parsing without external libraries
      String[] parts = inputJson.substring(1, inputJson.length() - 1).split(",");
      Object[] parsedInput = new Object[parts.length];
      for(int i=0; i<parts.length; i++) {
        String part = parts[i].trim();
        if(part.startsWith("\\"") && part.endsWith("\\"")) {
          parsedInput[i] = part.substring(1, part.length() - 1);
        } else {
          parsedInput[i] = Integer.parseInt(part);
        }
      }

      Solution sol = new Solution();
      Object output = sol.solution(parsedInput);

      // Basic JSON output without external libraries
      System.out.print("{\\"output\\": \\"" + output.toString() + "\\"}");
    } catch (Exception e) {
      e.printStackTrace(System.err);
      System.exit(1);
    }
  }
}
"""
        main_path.write_text(main_code, encoding="utf-8")

        compile_result = _run_process(["javac", "-d", tmp_dir, str(solution_path), str(main_path)])
        if compile_result.returncode != 0:
            compile_result.stderr = compile_result.stderr or "Java compilation error"
            return compile_result

        return _run_process(
            ["java", "-cp", tmp_dir, "Main"],
            {"JUDGE_INPUT_JSON": json.dumps(test_input)},
        )


def _execute_cpp(code: str, test_input: list) -> ExecResult:
    with tempfile.TemporaryDirectory(prefix="judge-cpp-") as tmp_dir:
        source_path = Path(tmp_dir) / "solution.cpp"
        output_path = Path(tmp_dir) / "solution"
        runner_code = f"""#include <iostream>
#include <vector>
#include <string>
#include <sstream>

{code}

int main() {{
  try {{
    std::string inputJson = getenv("JUDGE_INPUT_JSON");
    std::vector<std::string> args;
    std::string temp;
    std::stringstream ss(inputJson.substr(1, inputJson.length() - 2));
    while(getline(ss, temp, ',')) {{
      temp = temp.substr(1, temp.length() - 2);
      args.push_back(temp);
    }}

    std::string output = solution(args);

    std::cout << "{{\\"output\\": \\"" << output << "\\"}}";
  }} catch (const std::exception& e) {{
    std::cerr << e.what() << std::endl;
    return 1;
  }}
  return 0;
}}
"""
        source_path.write_text(runner_code, encoding="utf-8")

        compile_result = _run_process(["g++", str(source_path), "-o", str(output_path), "-std=c++11"])
        if compile_result.returncode != 0:
            compile_result.stderr = compile_result.stderr or "C++ compilation error"
            return compile_result

        return _run_process([str(output_path)], {"JUDGE_INPUT_JSON": json.dumps(test_input)})


def execute_code(language: str, code: str, test_input: list) -> ExecResult:
    if language == "javascript":
        return _execute_javascript(code, test_input)
    if language == "python":
        return _execute_python(code, test_input)
    if language == "java":
        return _execute_java(code, test_input)
    if language == "cpp":
        return _execute_cpp(code, test_input)
    raise ValueError(f"Unsupported language: {language}")


async def evaluate_submission(language: str, code: str, test_cases: list[dict]) -> dict:
    """Runs `code` against every test case and returns pass/fail counts plus
    per-case detail. `test_cases` is a list of {input, expected, isHidden}.

    Delegates to a worker thread (asyncio.to_thread) rather than running
    directly on the event loop. This function's entire body is blocking I/O —
    subprocess.run() with up to a 6-second timeout, looped once per test case —
    and previously ran straight on the async route handler's event loop. That
    meant one slow or timed-out submission froze the *entire* server for every
    concurrent user: confirmed directly by firing a timeout-inducing /clash/run
    request and observing an unrelated /health check block for 5.6 seconds
    behind it. Running the blocking work in a thread instead means only that
    one request waits — the event loop stays free to serve everyone else.
    """
    return await asyncio.to_thread(_evaluate_submission_sync, language, code, test_cases)


def _evaluate_submission_sync(language: str, code: str, test_cases: list[dict]) -> dict:
    import time

    started_at = time.monotonic()
    cases = []
    passed = 0

    for index, test_case in enumerate(test_cases):
        normalized_input = normalize_input(test_case.get("input"))
        expected = normalize_expected(test_case.get("expected"))
        is_hidden = bool(test_case.get("isHidden"))

        exec_result = execute_code(language, code, normalized_input)

        if exec_result.killed_by_timeout:
            cases.append({
                "index": index,
                "passed": False,
                "error": "Execution timeout",
                "hidden": is_hidden,
            })
            continue

        if exec_result.returncode != 0:
            cases.append({
                "index": index,
                "passed": False,
                "error": (exec_result.stderr or "Runtime error")[:700],
                "hidden": is_hidden,
            })
            continue

        try:
            parsed = json.loads(exec_result.stdout or "{}")
        except (json.JSONDecodeError, ValueError):
            parsed = {"output": (exec_result.stdout or "").strip()}

        did_pass = compare_outputs(parsed.get("output"), expected)
        if did_pass:
            passed += 1

        case_result = {
            "index": index,
            "passed": did_pass,
            "hidden": is_hidden,
        }
        if not is_hidden:
            case_result["output"] = parsed.get("output")
            case_result["expected"] = expected
        cases.append(case_result)

    elapsed_ms = int((time.monotonic() - started_at) * 1000)
    speed_bonus = max(0, 2500 - elapsed_ms)
    points = passed * 100 + speed_bonus // 25

    return {
        "passed": passed,
        "total": len(test_cases),
        "elapsedMs": elapsed_ms,
        "points": points,
        "cases": cases,
    }
