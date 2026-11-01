"""The built web app is served by the API in production (only when web/dist exists)."""
import pytest
from fastapi.testclient import TestClient

from konomi_api.main import WEB, app

pytestmark = pytest.mark.skipif(not (WEB / "index.html").exists(), reason="web app not built")


def test_spa_routes_return_index():
    c = TestClient(app)
    for path in ("/", "/chart", "/anime/123", "/settings"):
        r = c.get(path)
        assert r.status_code == 200 and '<div id="root">' in r.text


def test_unknown_api_path_is_404_not_index():
    assert TestClient(app).get("/api/nope").status_code == 404


def test_no_path_traversal():
    r = TestClient(app).get("/..%2f..%2fapi%2f.env")
    assert ".env" not in r.text and "DATABASE_URL" not in r.text
