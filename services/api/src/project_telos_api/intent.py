"""Topic relevance is independent of personal safety and thumbnail mismatch."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel


ViewerGoal = Literal["learn", "entertainment", "inspiration", "informed"]


class TopicMatch(BaseModel):
    """A conservative, inspectable topic match, not a recommendation model."""

    status: Literal["matched", "off-topic", "unrestricted", "unknown"]
    topics: list[str]
    matchedInterests: list[str]


def match_topics(interests: list[str], topics: list[str]) -> TopicMatch:
    """Match complete normalized topic phrases; never infer topics from a title."""
    def normalize(value: str) -> str:
        return " ".join(re.findall(r"\w+", value.casefold().replace("_", " ")))

    wanted = [(value, normalize(value)) for value in interests if normalize(value)]
    observed = [normalize(value) for value in topics if normalize(value)]
    matched = [
        value for value, phrase in wanted
        if any(f" {phrase} " in f" {topic} " or f" {topic} " in f" {phrase} " for topic in observed)
    ]
    status = (
        "unrestricted" if not wanted else "unknown" if not observed
        else "matched" if matched else "off-topic"
    )
    return TopicMatch(status=status, topics=topics, matchedInterests=matched)
