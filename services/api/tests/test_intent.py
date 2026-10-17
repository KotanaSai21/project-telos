"""Version one separates topic intent, goals, and safety boundaries."""

import pytest

from project_telos_api.intent import match_topics


@pytest.mark.parametrize(("interests", "topics", "status", "matched"), [
    (["aviation"], ["aviation"], "matched", ["aviation"]),
    (["AVIATION"], ["aviation lessons"], "matched", ["AVIATION"]),
    (["art"], ["party"], "off-topic", []),
    (["classical_music"], ["classical music"], "matched", ["classical_music"]),
    (["aviation"], ["cooking"], "off-topic", []),
    (["aviation"], [], "unknown", []),
    ([], ["cooking"], "unrestricted", []),
    (["  "], [], "unrestricted", []),
])
def test_topic_matching(interests, topics, status, matched):
    result = match_topics(interests, topics)
    assert result.status == status
    assert result.matchedInterests == matched
    assert result.topics == topics
