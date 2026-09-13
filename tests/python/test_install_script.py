"""scripts/install.sh on a Mac: puts the app from a release zip in place without the quarantine mark, refuses one whose
signature does not verify, and leaves a venv that already has python-pptx alone. Runs against a small ad-hoc signed bundle."""
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
import sys

import pytest

from conftest import ROOT

SCRIPT = ROOT / "scripts" / "install.sh"
pytestmark = pytest.mark.skipif(sys.platform != "darwin", reason="the installer uses macOS tools (ditto, codesign, xattr)")


def app_zip(tmp_path, version="9.9.9", tamper=False):
    """A signed mdslide.app zipped like electron-builder's release zip, marked as a browser download."""
    app = tmp_path / "build" / "mdslide.app"
    (app / "Contents" / "MacOS").mkdir(parents=True)
    (app / "Contents" / "Resources").mkdir()
    shutil.copy("/usr/bin/true", app / "Contents" / "MacOS" / "mdslide")
    (app / "Contents" / "Resources" / "note.txt").write_text(version)
    with open(app / "Contents" / "Info.plist", "wb") as f:
        plistlib.dump({"CFBundleIdentifier": "dev.mdslide.test", "CFBundleExecutable": "mdslide", "CFBundlePackageType": "APPL", "CFBundleShortVersionString": version}, f)
    subprocess.run(["codesign", "--force", "--sign", "-", str(app)], check=True, capture_output=True)
    if tamper:
        (app / "Contents" / "Resources" / "note.txt").write_text("changed after signing")
    z = tmp_path / f"mdslide-{version}-arm64-mac.zip"
    subprocess.run(["ditto", "-c", "-k", "--keepParent", str(app), str(z)], check=True)
    subprocess.run(["xattr", "-w", "com.apple.quarantine", "0083;00000000;Chrome;", str(z)], check=True)
    shutil.rmtree(app.parent)
    return z


def install(tmp_path, zip_path=None, **env):
    e = {k: v for k, v in os.environ.items() if not k.startswith("MDSLIDE_")}
    # A Japanese UTF-8 locale, as on the users' Macs: bash then treats some bytes of full-width text as name characters.
    e.update({"LANG": "ja_JP.UTF-8", "LC_ALL": "ja_JP.UTF-8", "MDSLIDE_APP_DIR": str(tmp_path / "Applications"), "MDSLIDE_NO_OPEN": "1", "XDG_CONFIG_HOME": str(tmp_path / "config")})
    if zip_path:
        e["MDSLIDE_ZIP"] = str(zip_path)
    e.update(env)
    return subprocess.run(["bash", str(SCRIPT)], env=e, capture_output=True, text=True)


def quarantined(path):
    return subprocess.run(["find", str(path), "-xattrname", "com.apple.quarantine"], capture_output=True, text=True).stdout.strip()


def test_installs_the_app_without_the_quarantine_mark(tmp_path):
    r = install(tmp_path, app_zip(tmp_path), MDSLIDE_SKIP_PYTHON="1")
    assert r.returncode == 0, r.stderr
    app = tmp_path / "Applications" / "mdslide.app"
    assert plistlib.loads((app / "Contents" / "Info.plist").read_bytes())["CFBundleShortVersionString"] == "9.9.9"
    assert quarantined(app) == ""  # the zip carries a browser's mark; the app must open without the "damaged" alert
    assert subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)]).returncode == 0
    assert f"mdslide 9.9.9 を {app} に入れました" in r.stdout


def test_replaces_an_installed_app(tmp_path):
    old = tmp_path / "Applications" / "mdslide.app"
    (old / "Contents").mkdir(parents=True)
    (old / "old.txt").write_text("previous")
    r = install(tmp_path, app_zip(tmp_path), MDSLIDE_SKIP_PYTHON="1")
    assert r.returncode == 0, r.stderr
    assert not (old / "old.txt").exists() and (old / "Contents" / "Info.plist").exists()


def test_refuses_an_app_whose_signature_does_not_verify_and_keeps_the_installed_one(tmp_path):
    old = tmp_path / "Applications" / "mdslide.app"
    (old / "Contents").mkdir(parents=True)
    (old / "old.txt").write_text("previous")
    r = install(tmp_path, app_zip(tmp_path, tamper=True), MDSLIDE_SKIP_PYTHON="1")
    assert r.returncode != 0
    assert "署名" in r.stderr
    assert (old / "old.txt").read_text() == "previous"


def test_rejects_a_version_that_is_not_a_version_number(tmp_path):
    r = install(tmp_path, MDSLIDE_VERSION="1.0;touch x", MDSLIDE_SKIP_PYTHON="1")
    assert r.returncode != 0 and "版" in r.stderr
    assert not (tmp_path / "Applications" / "mdslide.app").exists()


def test_leaves_a_venv_that_already_has_python_pptx(tmp_path):
    venv_python = tmp_path / "config" / "mdslide" / "venv" / "bin" / "python3"
    venv_python.parent.mkdir(parents=True)
    venv_python.write_text(f'#!/bin/sh\nexec "{sys.executable}" "$@"\n')  # the interpreter running these tests has python-pptx
    venv_python.chmod(0o755)
    r = install(tmp_path, app_zip(tmp_path))
    assert r.returncode == 0, r.stderr
    assert "python-pptx は入っています" in r.stdout


def release(zip_path, digest=None):
    """The part of the GitHub API's release JSON the installer reads: asset names and the sha256 GitHub recorded."""
    real = "sha256:" + hashlib.sha256(zip_path.read_bytes()).hexdigest()
    return {"assets": [{"name": "mdslide-9.9.9-arm64.dmg", "digest": "sha256:" + "0" * 64}, {"name": zip_path.name, "digest": digest or real}]}


def fake_download(tmp_path, release_json):
    """A curl on PATH serving the release from files; it insists on https only, like the real installer asks."""
    (tmp_path / "release.json").write_text(json.dumps(release_json))
    bin_dir = tmp_path / "fakebin"
    bin_dir.mkdir()
    tool = bin_dir / "curl"
    tool.write_text(f"""#!{sys.executable}
import os, shutil, sys
args = sys.argv[1:]
if "--proto" not in args or args[args.index("--proto") + 1] != "=https":
    sys.exit("fake: --proto =https is missing")
url = [a for a in args if a.startswith("https://")][-1]
if url.endswith("/releases/latest"):
    sys.stdout.write("https://github.com/froggugugugu/mdslide/releases/tag/v9.9.9")
    sys.exit(0)
src = os.path.join({str(tmp_path)!r}, "release.json" if "/releases/tags/" in url else url.rsplit("/", 1)[-1])
if not os.path.exists(src):
    sys.exit(22)
shutil.copy(src, args[args.index("-o") + 1])
""")
    tool.chmod(0o755)
    return f"{bin_dir}:{os.environ['PATH']}"


def test_downloads_the_latest_release_over_https_and_checks_its_digest(tmp_path):
    z = app_zip(tmp_path)
    r = install(tmp_path, MDSLIDE_SKIP_PYTHON="1", PATH=fake_download(tmp_path, release(z)))
    assert r.returncode == 0, r.stdout + r.stderr
    assert (tmp_path / "Applications" / "mdslide.app" / "Contents" / "Info.plist").exists()


def test_refuses_a_download_that_is_not_the_published_file(tmp_path):
    z = app_zip(tmp_path)
    r = install(tmp_path, MDSLIDE_SKIP_PYTHON="1", PATH=fake_download(tmp_path, release(z, digest="sha256:" + "1" * 64)))
    assert r.returncode != 0
    assert "一致しません" in r.stderr
    assert not (tmp_path / "Applications" / "mdslide.app").exists()

