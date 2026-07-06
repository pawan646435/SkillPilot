# SkillPilot FastAPI backend — Cloud Run image.
#
# Installs the four language runtimes the sandboxed judge (app/services/judge.py)
# spawns as subprocesses: Node.js (javascript), the base image's own Python3
# (python), a JDK (java, javac), and g++ (cpp).
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        gnupg \
        g++ \
        default-jdk-headless \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Cloud Run sets $PORT at runtime (defaults to 8080 locally if unset).
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
