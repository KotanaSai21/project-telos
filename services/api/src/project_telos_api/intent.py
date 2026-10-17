"""Topic relevance is independent of personal safety and thumbnail mismatch."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field


ViewerGoal = Literal["learn", "entertainment", "inspiration", "informed"]


class TopicMatch(BaseModel):
    """A conservative, inspectable topic match, not a recommendation model."""

    status: Literal["matched", "off-topic", "unrestricted", "unknown"]
    topics: list[str]
    matchedInterests: list[str]
    # Interests the model judged covered (synonyms, sub-topics) that the phrase match missed.
    judgedInterests: list[str] = Field(default_factory=list)


def normalize(value: str) -> str:
    return " ".join(re.findall(r"\w+", value.casefold().replace("_", " ")))


def match_topics(interests: list[str], topics: list[str], judged: list[str] | None = None) -> TopicMatch:
    """Match complete normalized topic phrases; never infer topics from a title.

    ``judged`` is the model's list of declared interests the observed video covers. Only
    entries naming one of the viewer's own interests count, so it can widen a match to
    synonyms ("woodworking" for "DIY") but never invent a new interest.
    """
    wanted = [(value, normalize(value)) for value in interests if normalize(value)]
    observed = [normalize(value) for value in topics if normalize(value)]
    matched = [
        value for value, phrase in wanted
        if any(f" {phrase} " in f" {topic} " or f" {topic} " in f" {phrase} " for topic in observed)
    ]
    judged_phrases = {normalize(value) for value in judged or []}
    extra = [value for value, phrase in wanted if phrase in judged_phrases and value not in matched]
    status = (
        "unrestricted" if not wanted
        else "matched" if matched or extra
        else "unknown" if not observed
        else "off-topic"
    )
    return TopicMatch(status=status, topics=topics, matchedInterests=matched + extra, judgedInterests=extra)
