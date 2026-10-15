"""Create the dependency-free install ZIP; run from any directory."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import json

build = Path(__file__).resolve().parent
root = build.parent
extension = root / "extension"
screenshots = root / "screenshots"
manifest = json.loads((extension / "manifest.json").read_text())
files = list(extension.iterdir())
required = [manifest["action"]["default_popup"]]
for script in manifest["content_scripts"]:
    required.extend(script.get("js", []) + script.get("css", []))
assert all((extension / name).is_file() for name in required)
archive = build / "x-pinned-sidebar.zip"
with ZipFile(archive, "w", ZIP_DEFLATED) as bundle:
    for file in sorted(files):
        if file.is_file():
            bundle.write(file, f"x-pinned-sidebar/{file.name}")
    bundle.write(root / "INSTALL.md", "x-pinned-sidebar/INSTALL.md")
    for name in ("preview.png", "emoji-picker-preview.png", "manage-lists-hover-preview.png", "manage-lists-profile-preview.png", "manage-lists-dialog-preview.png", "timeline-preview.png", "timeline-dropdown-preview.png", "list-view-preview.png", "sidebar-preferences-preview.png", "minimal-ui-preview.png", "search-only-sidebar-preview.png"):
        if (screenshots / name).is_file():
            bundle.write(screenshots / name, f"x-pinned-sidebar/{name}")
with ZipFile(archive) as bundle:
    assert bundle.testzip() is None
print(f"Ready: {archive} ({archive.stat().st_size:,} bytes)")
