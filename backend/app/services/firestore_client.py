"""firebase-admin Python SDK init, shared across routers and the auth dependency.

Mirrors the `if (!admin.apps.length) { admin.initializeApp(); }` guard repeated
at the top of every Node function file — here it's centralized in one place
since Python doesn't have per-file module-load races the way each Cloud
Function's cold start did.
"""
import asyncio
import os

import firebase_admin
from firebase_admin import firestore

_app: firebase_admin.App | None = None
_db = None


def ensure_firebase_app() -> firebase_admin.App:
    """Initializes the default Firebase app exactly once.

    On Cloud Run, firebase_admin.initialize_app() with no arguments picks up
    the attached service account automatically — same as admin.initializeApp()
    did in the Node functions. Auth token verification against the Firebase
    Auth *emulator* (FIREBASE_AUTH_EMULATOR_HOST) works even without real
    credentials, since verify_id_token trusts the emulator's unsigned tokens
    directly rather than fetching Google's public certs.
    """
    global _app
    if _app is None:
        try:
            _app = firebase_admin.get_app()
        except ValueError:
            _app = firebase_admin.initialize_app()
    return _app


def get_db():
    """Returns a shared Firestore client, initializing the app if needed.

    Firestore is different from Auth here: google-cloud-firestore's
    credential resolution runs eagerly and does NOT automatically fall back
    to anonymous credentials just because FIRESTORE_EMULATOR_HOST is set —
    firebase_admin.firestore.client() will still try (and fail) to resolve
    real Application Default Credentials in that case. So when the emulator
    host is set, we bypass firebase_admin's wrapper and construct a
    google-cloud-firestore client directly with anonymous credentials
    (which the emulator accepts unconditionally). In every other environment
    (Cloud Run, or local dev against the real project with real ADC), we use
    firebase_admin.firestore.client() as normal.
    """
    global _db
    if _db is None:
        if os.getenv("FIRESTORE_EMULATOR_HOST"):
            from google.auth.credentials import AnonymousCredentials
            from google.cloud.firestore import Client as GoogleFirestoreClient

            project_id = (
                os.getenv("FIREBASE_PROJECT_ID")
                or os.getenv("GOOGLE_CLOUD_PROJECT")
                or "demo-project"
            )
            _db = GoogleFirestoreClient(project=project_id, credentials=AnonymousCredentials())
        else:
            ensure_firebase_app()
            _db = firestore.client()
    return _db


# The firebase-admin / google-cloud-firestore client is synchronous — every
# .get()/.set()/.update()/.add() call blocks whatever thread calls it. Called
# directly from an `async def` route handler, that blocks the *entire* event
# loop (confirmed: a single slow judge run blocked an unrelated /health check
# for 5.6 seconds — see judge.py). These wrappers push each blocking call onto
# a worker thread via asyncio.to_thread so only the calling request waits.
async def async_get(doc_ref):
    return await asyncio.to_thread(doc_ref.get)


async def async_set(doc_ref, data, merge: bool = False):
    return await asyncio.to_thread(doc_ref.set, data, merge=merge)


async def async_update(doc_ref, data):
    return await asyncio.to_thread(doc_ref.update, data)


async def async_add(collection_ref, data):
    return await asyncio.to_thread(collection_ref.add, data)
