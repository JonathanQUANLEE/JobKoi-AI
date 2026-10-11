from pathlib import Path
from PIL import Image

src_img = Path(r"C:\Users\14905\.gemini\antigravity\brain\a203c67a-6766-482a-81a8-d29d83d4e70c\cute_bunny_offer_1791476687289.jpg")
img = Image.open(src_img).convert("RGBA")

# 目标目录
tauri_wheel_icons = Path(r"b:\antigtavity projects\bosszhitou\Bosszhipin-job-bot\src\boss_zhipin\tauri\icons")
src_tauri_icons = Path(r"b:\antigtavity projects\bosszhitou\Bosszhipin-job-bot\src-tauri\icons")
ui_public = Path(r"b:\antigtavity projects\bosszhitou\Bosszhipin-job-bot\tauri-ui\public")
ui_assets = Path(r"b:\antigtavity projects\bosszhitou\Bosszhipin-job-bot\tauri-ui\src\assets")

for d in [tauri_wheel_icons, src_tauri_icons, ui_public, ui_assets]:
    d.mkdir(parents=True, exist_ok=True)

# 尺寸清单
img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
img_256 = img.resize((256, 256), Image.Resampling.LANCZOS)
img_128 = img.resize((128, 128), Image.Resampling.LANCZOS)
img_32 = img.resize((32, 32), Image.Resampling.LANCZOS)

sizes_ico = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]

# 保存至 tauri wheel 目录 (pytauri-wheel 读这里)
img_512.save(tauri_wheel_icons / "icon.png", format="PNG")
img_512.save(tauri_wheel_icons / "icon-512.png", format="PNG")
img_128.save(tauri_wheel_icons / "128x128.png", format="PNG")
img_32.save(tauri_wheel_icons / "32x32.png", format="PNG")
img_512.save(tauri_wheel_icons / "icon.ico", format="ICO", sizes=sizes_ico)

# 保存至 src-tauri (独立打包读这里)
img_512.save(src_tauri_icons / "icon.png", format="PNG")
img_512.save(src_tauri_icons / "icon-512.png", format="PNG")
img_128.save(src_tauri_icons / "128x128.png", format="PNG")
img_32.save(src_tauri_icons / "32x32.png", format="PNG")
img_512.save(src_tauri_icons / "icon.ico", format="ICO", sizes=sizes_ico)

# 保存至 Web 前端资源
img_512.save(ui_assets / "logo.png", format="PNG")
img_512.save(ui_public / "favicon.png", format="PNG")
img_512.save(ui_public / "favicon.ico", format="ICO", sizes=sizes_ico)

print("Bunny icon deployed to all target folders successfully!")
