import os
import sys
import shutil
import tarfile
import urllib.request
import subprocess

print("==================================================", flush=True)
print("   YarGram — Hugging Face Gradio Runtime Loader   ", flush=True)
print("==================================================", flush=True)

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
NODE_VERSION = "v20.18.0"
NODE_DIR_NAME = f"node-{NODE_VERSION}-linux-x64"
NODE_TAR_NAME = f"{NODE_DIR_NAME}.tar.xz"
NODE_URL = f"https://nodejs.org/dist/{NODE_VERSION}/{NODE_TAR_NAME}"
NODE_BIN_DIR = os.path.join(ROOT_DIR, ".node_bin")

# 1. Проверяем наличие Node.js >= 20, при необходимости скачиваем официальный Linux бинарник
node_executable = shutil.which("node")
need_download_node = True

if node_executable:
    try:
        ver_output = subprocess.check_output([node_executable, "-v"], text=True).strip()
        major_version = int(ver_output.lstrip("v").split(".")[0])
        if major_version >= 20:
            print(f"[YarGram] Найдена системная Node.js: {ver_output}", flush=True)
            need_download_node = False
        else:
            print(f"[YarGram] Системная Node.js {ver_output} < 20. Загружаем Node.js {NODE_VERSION}...", flush=True)
    except Exception:
        pass

if need_download_node:
    node_installed_marker = os.path.join(NODE_BIN_DIR, "bin", "node")
    if not os.path.exists(node_installed_marker):
        print(f"[YarGram] Скачиваем официальный бинарник Node.js {NODE_VERSION} для Linux...", flush=True)
        tar_dest = os.path.join(ROOT_DIR, NODE_TAR_NAME)
        urllib.request.urlretrieve(NODE_URL, tar_dest)
        print("[YarGram] Распаковываем Node.js...", flush=True)
        with tarfile.open(tar_dest, "r:xz") as tar:
            tar.extractall(ROOT_DIR)
        if os.path.exists(NODE_BIN_DIR):
            shutil.rmtree(NODE_BIN_DIR)
        os.rename(os.path.join(ROOT_DIR, NODE_DIR_NAME), NODE_BIN_DIR)
        if os.path.exists(tar_dest):
            os.remove(tar_dest)
        print("[YarGram] Node.js успешно установлена!", flush=True)

    node_bin_path = os.path.join(NODE_BIN_DIR, "bin")
    os.environ["PATH"] = node_bin_path + ":" + os.environ.get("PATH", "")

# Проверяем активные версии
try:
    active_node = subprocess.check_output(["node", "-v"], text=True).strip()
    active_npm = subprocess.check_output(["npm", "-v"], text=True).strip()
    print(f"[YarGram] Активная версия Node: {active_node}, npm: {active_npm}", flush=True)
except Exception as e:
    print(f"[YarGram Error] Ошибка проверки Node.js: {e}", flush=True)
    sys.exit(1)

# 2. Переменные окружения для YarGram
os.environ["PORT"] = "7860"
os.environ["HOST"] = "0.0.0.0"
os.environ["NODE_ENV"] = "production"

data_dir = os.environ.get("DATA_DIR", os.path.join(ROOT_DIR, "data"))
os.environ["DATA_DIR"] = data_dir
os.makedirs(data_dir, exist_ok=True)

if not os.environ.get("JWT_SECRET") or os.environ.get("JWT_SECRET") == "yargram-development-secret-change-me":
    os.environ["JWT_SECRET"] = "yargram_hf_space_default_jwt_secret_change_if_needed_32chars"

if not os.environ.get("DB_ENCRYPTION_KEY") or os.environ.get("DB_ENCRYPTION_KEY") == "yargram-development-encryption-key-change-me":
    os.environ["DB_ENCRYPTION_KEY"] = "yargram_hf_space_default_db_encryption_key_32chars"

# 3. Установка зависимостей и сборка при первом запуске
node_modules = os.path.join(ROOT_DIR, "node_modules")
if not os.path.exists(node_modules):
    print("[YarGram] Устанавливаем зависимости workspaces (npm install)...", flush=True)
    subprocess.run(["npm", "install", "--workspaces", "--include-workspace-root", "--omit=dev"], cwd=ROOT_DIR, check=True)

server_dist = os.path.join(ROOT_DIR, "apps", "server", "dist", "index.js")
web_dist = os.path.join(ROOT_DIR, "apps", "web", "dist", "index.html")

if not (os.path.exists(server_dist) and os.path.exists(web_dist)):
    print("[YarGram] Собираем проект (npm run build)...", flush=True)
    subprocess.run(["npm", "run", "build"], cwd=ROOT_DIR, check=True)

print("[YarGram] Запуск сервера YarGram на порту 7860...", flush=True)
sys.stdout.flush()

# 4. Запускаем сервер YarGram
server_process = subprocess.Popen(["node", "apps/server/dist/index.js"], cwd=ROOT_DIR, env=os.environ)

try:
    server_process.wait()
except KeyboardInterrupt:
    server_process.terminate()
    server_process.wait()

sys.exit(server_process.returncode)
