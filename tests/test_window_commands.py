from unittest.mock import patch
import pytest

from boss_zhipin.tauri.commands.window import open_external_url, _OpenExternalUrlBody


@pytest.mark.anyio
async def test_open_external_url_success():
    with patch("webbrowser.open") as mock_open:
        mock_open.return_value = True
        body = _OpenExternalUrlBody(url="https://github.com/signup")
        res = await open_external_url(body)
        assert res["status"] == "ok"
        assert res["url"] == "https://github.com/signup"
        mock_open.assert_called_once_with("https://github.com/signup")


@pytest.mark.anyio
async def test_open_external_url_invalid():
    with patch("webbrowser.open") as mock_open:
        body = _OpenExternalUrlBody(url="ftp://invalid")
        res = await open_external_url(body)
        assert res["status"] == "error"
        mock_open.assert_not_called()
