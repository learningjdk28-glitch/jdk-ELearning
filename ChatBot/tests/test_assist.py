from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.assistant import SYSTEM_PROMPT, TutorAgent
from app.main import create_app


class FakeClient:
    def __init__(self, fail_first=False):
        self.calls = []
        self.fail_first = fail_first
        self.chat = SimpleNamespace(completions=self)

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.fail_first and len(self.calls) == 1:
            raise RuntimeError("rate limited")
        msg = SimpleNamespace(content="A router sends data between networks.", tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


class FakeVerifier:
    def __init__(self, ok):
        self.ok = ok

    def verify(self, token):
        from app.auth import AuthError

        if token != self.ok:
            raise AuthError(401, "Sign in again.")
        return "u1"


def _app(client, user_verifier=None):
    return create_app(
        agent=None, tutor=TutorAgent(client, ["m1", "m2"]), user_verifier=user_verifier, requests_per_minute=3
    )


def test_tutor_uses_system_prompt_and_no_tools():
    client = FakeClient()
    reply = TutorAgent(client, "m").chat([{"role": "user", "content": "What is a router?"}])
    assert reply.startswith("A router")
    call = client.calls[0]
    assert call["messages"][0] == {"role": "system", "content": SYSTEM_PROMPT}
    assert "tools" not in call


def test_tutor_falls_back_to_next_model():
    client = FakeClient(fail_first=True)
    TutorAgent(client, ["m1", "m2"]).chat([{"role": "user", "content": "hi"}])
    assert [c["model"] for c in client.calls] == ["m1", "m2"]


def test_assist_endpoint_local_mode():
    r = TestClient(_app(FakeClient())).post("/api/assist", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 200
    assert "router" in r.json()["reply"]


def test_assist_requires_sign_in_when_verifier_set():
    http = TestClient(_app(FakeClient(), FakeVerifier("good")))
    body = {"messages": [{"role": "user", "content": "hi"}]}
    assert http.post("/api/assist", json=body).status_code == 401
    assert http.post("/api/assist", json=body, headers={"Authorization": "Bearer bad"}).status_code == 401
    assert http.post("/api/assist", json=body, headers={"Authorization": "Bearer good"}).status_code == 200


def test_assist_rate_limited():
    http = TestClient(_app(FakeClient()))
    body = {"messages": [{"role": "user", "content": "hi"}]}
    codes = [http.post("/api/assist", json=body).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_assist_disabled_without_tutor():
    http = TestClient(create_app(agent=None))
    r = http.post("/api/assist", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 404


def test_assist_hides_provider_errors():
    class Broken:
        def __init__(self):
            self.chat = SimpleNamespace(completions=self)

        def create(self, **kwargs):
            raise RuntimeError("secret internal detail")

    r = TestClient(_app(Broken())).post("/api/assist", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code == 502
    assert "secret" not in r.text
