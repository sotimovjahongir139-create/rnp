import os
from dotenv import load_dotenv

# Load repo-root .env (local dev) and cwd/.env (on the VPS, cwd is the deploy root).
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv()


def connect():
    import psycopg
    return psycopg.connect(os.environ["DATABASE_URL"])
