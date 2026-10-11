import subprocess
from pathlib import Path

test_bat = Path(r"b:\antigtavity projects\bosszhitou\test_run.bat")
test_bat.write_text(
    '@echo off\n"%~dp0Bosszhipin-job-bot\\.venv\\Scripts\\python.exe" -c "print(\'BAT_TEST_PASSED\')"\n',
    encoding="gbk",
)

res = subprocess.run([str(test_bat)], capture_output=True, text=True, shell=True)
print("STDOUT:", res.stdout)
print("STDERR:", res.stderr)
print("RETURNCODE:", res.returncode)

test_bat.unlink(missing_ok=True)
