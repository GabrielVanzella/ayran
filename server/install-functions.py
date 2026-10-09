"""Instala/atualiza as funcoes do Ayran (server/functions/*.py) no banco do Open WebUI.

Uso (com o Open WebUI parado):  <venv>\\Scripts\\python.exe -I server\\install-functions.py
O dono das funcoes e o primeiro admin cadastrado.
"""

import json
import os
import re
import sqlite3
import time
from pathlib import Path

ayran_home = Path(os.environ.get("AYRAN_HOME", Path.home() / "ayran-server"))
db = sqlite3.connect(ayran_home / "data" / "webui.db")

admin = db.execute("select id from user where role = 'admin' order by created_at limit 1").fetchone()
if not admin:
    raise SystemExit("Nenhum admin cadastrado ainda: crie a conta no Open WebUI primeiro.")

now = int(time.time())
for path in sorted((Path(__file__).parent / "functions").glob("*.py")):
    content = path.read_text(encoding="utf-8")
    front = dict(re.findall(r"^(\w+):\s*(.+)$", content.split('"""')[1], re.MULTILINE))
    fn_id = path.stem.split("_")[0]  # ayran_router.py -> "ayran" (vira o id do modelo)
    fn_type = "pipe" if "class Pipe" in content else "filter"
    meta = json.dumps({"description": front.get("description", ""), "manifest": front})
    exists = db.execute("select 1 from function where id = ?", (fn_id,)).fetchone()
    if exists:
        db.execute(
            "update function set content = ?, meta = ?, name = ?, type = ?, updated_at = ? where id = ?",
            (content, meta, front.get("title", fn_id), fn_type, now, fn_id),
        )
    else:
        db.execute(
            "insert into function (id, user_id, name, type, content, meta, valves, is_active, is_global,"
            " updated_at, created_at) values (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)",
            (fn_id, admin[0], front.get("title", fn_id), fn_type, content, meta, "{}", now, now),
        )
    print(("atualizada" if exists else "instalada") + f": {fn_id} ({fn_type})")
db.commit()
