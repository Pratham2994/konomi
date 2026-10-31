import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (ARRAY, BigInteger, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer,
                        SmallInteger, String, Text, func)
from sqlalchemy.dialects.postgresql import CITEXT, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(CITEXT, unique=True)
    username: Mapped[str] = mapped_column(CITEXT, unique=True)
    password_hash: Mapped[str] = mapped_column(String)
    display_name: Mapped[str] = mapped_column(String(60))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    profile: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Session_(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class EmailOtp(Base):
    __tablename__ = "email_otps"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(CITEXT, index=True)
    purpose: Mapped[str] = mapped_column(String(10))
    code_hash: Mapped[str] = mapped_column(String)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (CheckConstraint("purpose in ('verify','reset')"),)


class Anime(Base):
    __tablename__ = "anime"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    aod_key: Mapped[str] = mapped_column(String, unique=True)
    mal_id: Mapped[int | None] = mapped_column(Integer, index=True)
    anilist_id: Mapped[int | None] = mapped_column(Integer, index=True)
    title: Mapped[str] = mapped_column(String)
    title_en: Mapped[str | None] = mapped_column(String)
    synonyms: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    type: Mapped[str] = mapped_column(String(10))
    episodes: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(10))
    season: Mapped[str | None] = mapped_column(String(10))
    year: Mapped[int | None] = mapped_column(Integer)
    picture: Mapped[str | None] = mapped_column(String)
    thumbnail: Mapped[str | None] = mapped_column(String)
    duration_s: Mapped[int | None] = mapped_column(Integer)
    score: Mapped[float | None] = mapped_column(Float)
    studios: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    genres: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    synopsis: Mapped[str | None] = mapped_column(Text)
    popularity: Mapped[int] = mapped_column(BigInteger, default=0)
    color: Mapped[str | None] = mapped_column(String(9))
    related: Mapped[list[int]] = mapped_column(ARRAY(Integer), default=list)
    embedding = mapped_column(Vector(), nullable=True)
    x: Mapped[float | None] = mapped_column(Float)
    y: Mapped[float | None] = mapped_column(Float)
    z: Mapped[float | None] = mapped_column(Float)
    cluster: Mapped[int | None] = mapped_column(SmallInteger)
    has_cf: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class ListEntry(Base):
    __tablename__ = "list_entries"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    anime_id: Mapped[int] = mapped_column(ForeignKey("anime.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[str] = mapped_column(String(10))
    episodes_watched: Mapped[int | None] = mapped_column(Integer)
    tier: Mapped[int | None] = mapped_column(SmallInteger)
    facets: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    score: Mapped[float | None] = mapped_column(Float)
    predicted: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(10), default="konomi", server_default="konomi")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                 onupdate=func.now())
    __table_args__ = (
        CheckConstraint("status in ('completed','watching','dropped','planned')"),
        CheckConstraint("tier is null or tier between 1 and 5"),
    )


class Duel(Base):
    __tablename__ = "duels"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    a_id: Mapped[int] = mapped_column(ForeignKey("anime.id", ondelete="CASCADE"))
    b_id: Mapped[int] = mapped_column(ForeignKey("anime.id", ondelete="CASCADE"))
    outcome: Mapped[str] = mapped_column(String(4))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (CheckConstraint("outcome in ('a','b','tie')"),)
