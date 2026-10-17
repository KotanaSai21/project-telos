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


@pytest.mark.parametrize(("interests", "topics", "judged", "status", "matched", "extra"), [
    # The model can widen a match to a synonym the phrase match misses...
    (["DIY"], ["woodworking", "garage shelving"], ["diy"], "matched", ["DIY"], ["DIY"]),
    (["DIY"], [], ["DIY"], "matched", ["DIY"], ["DIY"]),
    # ...but cannot add an interest the viewer never declared.
    (["aviation"], ["kittens"], ["cute animals"], "off-topic", [], []),
    # A phrase match is not double counted as judged.
    (["cooking"], ["cooking tutorial"], ["cooking"], "matched", ["cooking"], []),
])
def test_model_judged_matches_only_widen_declared_interests(interests, topics, judged, status, matched, extra):
    result = match_topics(interests, topics, judged)
    assert result.status == status
    assert result.matchedInterests == matched
    assert result.judgedInterests == extra
