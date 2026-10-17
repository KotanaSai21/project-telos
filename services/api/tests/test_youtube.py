"""URL validation is a security boundary, so it is tested like one."""

from __future__ import annotations

import pytest

from project_telos_api.youtube import (
    InvalidYouTubeUrlError,
    looks_like_youtube,
    parse_youtube_url,
)

VIDEO_ID = "dQw4w9WgXcQ"


class TestAcceptedForms:
    @pytest.mark.parametrize(
        "url",
        [
            f"https://www.youtube.com/watch?v={VIDEO_ID}",
            f"https://youtube.com/watch?v={VIDEO_ID}",
            f"https://m.youtube.com/watch?v={VIDEO_ID}",
            f"https://www.youtube.com/shorts/{VIDEO_ID}",
            f"https://youtube.com/shorts/{VIDEO_ID}",
            f"https://youtu.be/{VIDEO_ID}",
            f"https://www.youtube.com/embed/{VIDEO_ID}",
            f"https://www.youtube.com/live/{VIDEO_ID}",
        ],
    )
    def test_extracts_the_video_id(self, url: str) -> None:
        assert parse_youtube_url(url).video_id == VIDEO_ID

    def test_recognises_a_short(self) -> None:
        assert parse_youtube_url(f"https://www.youtube.com/shorts/{VIDEO_ID}").is_short is True

    def test_watch_urls_are_not_shorts(self) -> None:
        assert parse_youtube_url(f"https://youtu.be/{VIDEO_ID}").is_short is False

    def test_adds_a_missing_scheme(self) -> None:
        assert parse_youtube_url(f"youtube.com/shorts/{VIDEO_ID}").video_id == VIDEO_ID

    def test_tolerates_surrounding_whitespace(self) -> None:
        assert parse_youtube_url(f"  https://youtu.be/{VIDEO_ID}  ").video_id == VIDEO_ID

    def test_ignores_extra_query_parameters(self) -> None:
        url = f"https://www.youtube.com/watch?v={VIDEO_ID}&t=42s&feature=share"
        assert parse_youtube_url(url).video_id == VIDEO_ID

    def test_all_forms_share_one_cache_key(self) -> None:
        """The same video pasted differently must not be analysed twice."""
        forms = [
            f"https://www.youtube.com/watch?v={VIDEO_ID}",
            f"https://youtu.be/{VIDEO_ID}",
            f"https://www.youtube.com/shorts/{VIDEO_ID}",
        ]
        hashes = {parse_youtube_url(url).asset_hash for url in forms}
        assert len(hashes) == 1


class TestRejection:
    @pytest.mark.parametrize(
        "url",
        [
            "",
            "   ",
            "not a url",
            "https://vimeo.com/123456",
            "https://youtube.evil.com/watch?v=dQw4w9WgXcQ",
            "https://notyoutube.com/shorts/dQw4w9WgXcQ",
            "https://www.youtube.com/",
            "https://www.youtube.com/@channel",
            "https://www.youtube.com/watch",
            "https://www.youtube.com/watch?v=tooshort",
            "https://www.youtube.com/shorts/way-too-long-an-id-here",
            "https://www.youtube.com/shorts/bad!chars$",
        ],
    )
    def test_rejects_invalid_input(self, url: str) -> None:
        with pytest.raises(InvalidYouTubeUrlError):
            parse_youtube_url(url)

    @pytest.mark.parametrize(
        "url",
        [
            "file:///etc/passwd",
            "ftp://youtube.com/shorts/dQw4w9WgXcQ",
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
        ],
    )
    def test_rejects_non_http_schemes(self, url: str) -> None:
        with pytest.raises(InvalidYouTubeUrlError):
            parse_youtube_url(url)

    @pytest.mark.parametrize(
        "url",
        [
            "http://localhost/watch?v=dQw4w9WgXcQ",
            "http://127.0.0.1:8000/watch?v=dQw4w9WgXcQ",
            "http://169.254.169.254/watch?v=dQw4w9WgXcQ",
            "http://[::1]/shorts/dQw4w9WgXcQ",
            "http://10.0.0.1/shorts/dQw4w9WgXcQ",
        ],
    )
    def test_rejects_internal_addresses(self, url: str) -> None:
        """Host allow-listing is what keeps link ingest from becoming SSRF."""
        with pytest.raises(InvalidYouTubeUrlError):
            parse_youtube_url(url)

    def test_rejects_an_oversized_url(self) -> None:
        with pytest.raises(InvalidYouTubeUrlError, match="too long"):
            parse_youtube_url("https://youtu.be/" + "a" * 3000)

    def test_looks_like_youtube_never_raises(self) -> None:
        assert looks_like_youtube("https://evil.example") is False
        assert looks_like_youtube(f"https://youtu.be/{VIDEO_ID}") is True


class TestCanonicalisation:
    def test_always_produces_a_watch_url(self) -> None:
        video = parse_youtube_url(f"https://www.youtube.com/shorts/{VIDEO_ID}")
        assert video.canonical_url == f"https://www.youtube.com/watch?v={VIDEO_ID}"

    def test_thumbnail_points_at_the_cdn(self) -> None:
        assert parse_youtube_url(f"https://youtu.be/{VIDEO_ID}").thumbnail_url.startswith(
            "https://i.ytimg.com/vi/"
        )
