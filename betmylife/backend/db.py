import os
from contextlib import contextmanager
from typing import Iterator

import pymysql
from dotenv import load_dotenv
from pymysql.connections import Connection

load_dotenv()

def connection_config() -> dict[str, object]:
    return {
        "host": os.getenv("TIDB_HOST", "127.0.0.1"),
        "port": int(os.getenv("TIDB_PORT", "4000")),
        "user": os.getenv("TIDB_USER", "root"),
        "password": os.getenv("TIDB_PASSWORD", ""),
        "database": os.getenv("TIDB_DATABASE", "predict_my_life"),
        "ssl": {"ca": os.getenv("TIDB_CA_PATH")} if os.getenv("TIDB_CA_PATH") else None,
        "cursorclass": pymysql.cursors.DictCursor,
        "autocommit": True,
    }


@contextmanager
def get_connection() -> Iterator[Connection]:
    connection = pymysql.connect(**connection_config())
    try:
        yield connection
    finally:
        connection.close()


def init_db() -> None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id VARCHAR(64) PRIMARY KEY,
                    username VARCHAR(40) NOT NULL UNIQUE,
                    password_hash VARCHAR(255) NOT NULL DEFAULT '',
                    nickname VARCHAR(80) NULL,
                    age INT NULL,
                    gender VARCHAR(20) NULL,
                    display_name VARCHAR(80) NOT NULL,
                    avatar VARCHAR(255) NOT NULL DEFAULT '',
                    bio VARCHAR(255) NOT NULL DEFAULT '',
                    points INT NOT NULL DEFAULT 0,
                    profile_frame VARCHAR(80) NOT NULL DEFAULT 'Default Frame',
                    badge VARCHAR(80) NOT NULL DEFAULT 'First Challenge',
                    background VARCHAR(80) NOT NULL DEFAULT 'Default Background',
                    custom_title VARCHAR(80) NOT NULL DEFAULT 'New Explorer',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute("SHOW COLUMNS FROM users LIKE 'password_hash'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT ''")
            for column, definition in (("nickname", "VARCHAR(80) NULL"), ("age", "INT NULL"), ("gender", "VARCHAR(20) NULL")):
                cursor.execute(f"SHOW COLUMNS FROM users LIKE '{column}'")
                if not cursor.fetchone():
                    cursor.execute(f"ALTER TABLE users ADD COLUMN {column} {definition}")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS user_app_states (
                    user_id VARCHAR(64) PRIMARY KEY,
                    version INT NOT NULL DEFAULT 1,
                    state_json JSON NOT NULL,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS user_follows (
                    follower_id VARCHAR(64) NOT NULL,
                    followed_id VARCHAR(64) NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (follower_id, followed_id),
                    INDEX idx_user_follows_followed (followed_id)
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS challenges (
                    id VARCHAR(64) PRIMARY KEY,
                    user_id VARCHAR(64) NOT NULL,
                    title VARCHAR(1000) NOT NULL,
                    category VARCHAR(40) NOT NULL,
                    difficulty TINYINT NOT NULL,
                    confidence TINYINT NOT NULL,
                    visibility VARCHAR(20) NOT NULL DEFAULT 'public',
                    deadline_at DATETIME(6) NOT NULL,
                    deadline_label VARCHAR(120) NOT NULL,
                    probability DECIMAL(5,2) NOT NULL DEFAULT 50,
                    yes_odds DECIMAL(8,2) NOT NULL DEFAULT 2,
                    no_odds DECIMAL(8,2) NOT NULL DEFAULT 2,
                    analysis_json JSON NULL,
                    proof_plan_json JSON NULL,
                    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                        ON UPDATE CURRENT_TIMESTAMP(6),
                    INDEX idx_challenges_user_created (user_id, created_at),
                    INDEX idx_challenges_visibility_created (visibility, created_at),
                    CONSTRAINT fk_challenges_user FOREIGN KEY (user_id) REFERENCES users(id)
                )
                """
            )
