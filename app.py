import os
import sys
import shutil
import tarfile
import urllib.request
import subprocess

try:
    import spaces

    @spaces.GPU
    def gpu_ready():
        return True
except Exception:
    pass

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

# 3. Установка production-зависимостей сервера
server_modules = os.path.join(ROOT_DIR, "node_modules", "express")
if not os.path.exists(server_modules):
    print("[YarGram] Устанавливаем production-зависимости сервера (@yargram/server)...", flush=True)
    subprocess.run(["npm", "install", "--omit=dev", "--workspace", "@yargram/server"], cwd=ROOT_DIR, check=True)

# 4. Проверка скомпилированных файлов сборки
server_entry = os.path.join(ROOT_DIR, "apps", "server", "out", "index.js")
if not os.path.exists(server_entry):
    server_entry = os.path.join(ROOT_DIR, "apps", "server", "dist", "index.js")

server_dir = os.path.join(ROOT_DIR, "apps", "server")
if os.path.exists(server_dir):
    print(f"[YarGram Debug] apps/server contents: {os.listdir(server_dir)}", flush=True)

print(f"[YarGram] Проверка сборки: server_entry={server_entry} (exists: {os.path.exists(server_entry)})", flush=True)

print(f"[YarGram] Запуск сервера YarGram на порту 7860 ({server_entry})...", flush=True)
sys.stdout.flush()

# 5. Запуск сервера YarGram
server_process = subprocess.Popen(["node", server_entry], cwd=ROOT_DIR, env=os.environ)

try:
    server_process.wait()
except KeyboardInterrupt:
    server_process.terminate()
    server_process.wait()

sys.exit(server_process.returncode)
