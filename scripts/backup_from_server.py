import os
import sys
import json
import socket
import datetime
import zipfile
import paramiko

HOST = "ssh-top1nuk1.alwaysdata.net"
USER = "top1nuk1"
PASS = "#sn.R939$CRwGvV"

REMOTE_BASE = "/home/top1nuk1/yargram/apps/server/data"
REMOTE_DB = f"{REMOTE_BASE}/yargram.json"
REMOTE_UPLOADS = f"{REMOTE_BASE}/uploads"

def get_desktop_backup_dir():
    # C:\Users\<Username>\Desktop\Бэкапы YarGram
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    if not os.path.exists(desktop):
        desktop = os.path.join(os.environ.get("USERPROFILE", "C:\\Users\\Top1Nuk1"), "Desktop")
    backup_dir = os.path.join(desktop, "Бэкапы YarGram")
    os.makedirs(backup_dir, exist_ok=True)
    return backup_dir

def connect_ssh():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('192.168.0.12', 0))
        s.connect((HOST, 22))
        client.connect(HOST, username=USER, password=PASS, sock=s, timeout=30)
    except Exception:
        client.connect(HOST, username=USER, password=PASS, timeout=30)
    return client

def make_backup():
    now = datetime.datetime.now()
    timestamp_str = now.strftime("%Y-%m-%d_%H-%M-%S")
    readable_date = now.strftime("%d.%m.%Y в %H:%M:%S")

    print("=" * 60)
    print(f"📦 YarGram — Создание резервной копии сервера на ПК")
    print(f"🕒 Время загрузки: {readable_date}")
    print("=" * 60)

    backup_root = get_desktop_backup_dir()
    backup_folder_name = f"backup_{timestamp_str}"
    target_dir = os.path.join(backup_root, backup_folder_name)
    target_uploads = os.path.join(target_dir, "uploads")
    os.makedirs(target_uploads, exist_ok=True)

    print(f"\n[1/4] Подключение к серверу {HOST}...")
    client = connect_ssh()
    sftp = client.open_sftp()
    print("  ✓ Соединение установлено")

    # 1. Скачиваем базу данных
    print(f"\n[2/4] Загрузка базы данных (yargram.json)...")
    local_db_path = os.path.join(target_dir, "yargram.json")
    try:
        remote_stat = sftp.stat(REMOTE_DB)
        sftp.get(REMOTE_DB, local_db_path)
        db_size_kb = os.path.getsize(local_db_path) / 1024
        print(f"  ✓ База данных сохранена: {db_size_kb:.1f} КБ")
        
        # Читаем сводку из базы
        try:
            with open(local_db_path, "r", encoding="utf-8") as f:
                db_data = json.load(f)
            users_count = len(db_data.get("users", []))
            messages_count = len(db_data.get("messages", []))
            conversations_count = len(db_data.get("conversations", []))
            print(f"    • Пользователей: {users_count}")
            print(f"    • Диалогов/групп: {conversations_count}")
            print(f"    • Сообщений: {messages_count}")
        except Exception:
            pass
    except Exception as e:
        print(f"  ⚠ Ошибка загрузки базы: {e}")

    # 2. Скачиваем файлы uploads
    print(f"\n[3/4] Загрузка медиа-файлов и вложений из uploads...")
    try:
        remote_files = sftp.listdir_attr(REMOTE_UPLOADS)
        total_files = len(remote_files)
        total_size = sum(f.st_size for f in remote_files) / (1024 * 1024)
        print(f"  Найдено файлов на сервере: {total_files} ({total_size:.1f} МБ)")

        downloaded_count = 0
        for i, file_attr in enumerate(remote_files, 1):
            fname = file_attr.filename
            r_path = f"{REMOTE_UPLOADS}/{fname}"
            l_path = os.path.join(target_uploads, fname)

            # Проверяем кэш локального хранилища проекта для экономии трафика
            cached_path = os.path.join("apps/server/data/uploads", fname)
            if not os.path.exists(l_path):
                if os.path.exists(cached_path) and os.path.getsize(cached_path) == file_attr.st_size:
                    # Быстро копируем локальный кэш
                    import shutil
                    shutil.copy2(cached_path, l_path)
                else:
                    sftp.get(r_path, l_path)
                    downloaded_count += 1
            if i % 10 == 0 or i == total_files:
                print(f"  • Обработано {i}/{total_files} файлов...", end="\r")
        print(f"\n  ✓ Все файлы успешно синхронизированы в {target_uploads}")
    except Exception as e:
        print(f"  ⚠ Ошибка загрузки uploads: {e}")

    sftp.close()
    client.close()

    # 3. Создаем мета-файл с информацией о бэкапе
    meta = {
        "service": "YarGram",
        "timestamp": timestamp_str,
        "created_at_pc": readable_date,
        "server": HOST,
        "files_count": len(os.listdir(target_uploads)),
    }
    with open(os.path.join(target_dir, "backup_info.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    # 4. Упаковываем в компактный zip-архив
    print(f"\n[4/4] Создание ZIP-архива...")
    zip_filename = os.path.join(backup_root, f"{backup_folder_name}.zip")
    with zipfile.ZipFile(zip_filename, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(target_dir):
            for file in files:
                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, target_dir)
                zf.write(abs_path, arcname=rel_path)

    zip_size_mb = os.path.getsize(zip_filename) / (1024 * 1024)
    print(f"  ✓ Архив создан: {zip_filename} ({zip_size_mb:.2f} МБ)")

    print("\n" + "=" * 60)
    print("✅ РЕЗЕРВНАЯ КОПИЯ УСПЕШНО СОХРАНЕНА НА ВАШ ПК!")
    print(f"📁 Папка:   {target_dir}")
    print(f"🗜 Архив:   {zip_filename}")
    print("=" * 60)

if __name__ == "__main__":
    try:
        make_backup()
    except Exception as ex:
        print(f"\n❌ Ошибка при создании бэкапа: {ex}")
        import traceback
        traceback.print_exc()
