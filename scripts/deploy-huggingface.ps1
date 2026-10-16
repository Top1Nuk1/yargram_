[CmdletBinding()]
param(
    [string]$Username = "Top1Nuk1",
    [string]$SpaceName = "Yargram",
    [string]$Token
)

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   YarGram — Публикация на Hugging Face Spaces (Облако)   " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[ОШИБКА] Git не найден в системе. Установите Git для Windows." -ForegroundColor Red
    pause
    exit 1
}

$inputUser = Read-Host "Логин на Hugging Face [Enter = $Username]"
if ($inputUser.Trim()) { $Username = $inputUser.Trim() }

$inputSpace = Read-Host "Имя Space [Enter = $SpaceName]"
if ($inputSpace.Trim()) { $SpaceName = $inputSpace.Trim() }


if (-not $Token) {
    Write-Host ""
    Write-Host "Токен можно создать тут: https://huggingface.co/settings/tokens (права Write)" -ForegroundColor Gray
    $Token = Read-Host "Вставьте ваш Access Token Hugging Face (начинается на hf_...)"
}
$Token = $Token.Trim()

if (-not $Token) {
    Write-Host "[ОШИБКА] Токен не указан." -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host "[1/3] Проверяем Git-репозиторий..." -ForegroundColor Green
$currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($currentBranch -ne "main") {
    Write-Host "Текущая ветка: $currentBranch. Переключаемся на main..." -ForegroundColor Yellow
    git checkout -B main
}

# URL с токеном для пуша без пароля
$remoteUrl = "https://${Username}:${Token}@huggingface.co/spaces/${Username}/${SpaceName}"

# Проверяем remote hf
$existingRemote = git remote | Where-Object { $_ -eq "hf" }
if ($existingRemote) {
    git remote set-url hf $remoteUrl
} else {
    git remote add hf $remoteUrl
}

Write-Host "[2/3] Отправляем код в Hugging Face Space ($Username/$SpaceName)..." -ForegroundColor Green
git push hf main --force

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ОШИБКА] Не удалось отправить код в Hugging Face." -ForegroundColor Red
    Write-Host "Проверьте:" -ForegroundColor Yellow
    Write-Host "1. Создан ли Space на https://huggingface.co/spaces/${Username}/${SpaceName}" -ForegroundColor White
    Write-Host "2. Правильность токена (должен иметь права Write)" -ForegroundColor White
    Write-Host "3. SDK Спейса должен быть выбран: Docker -> Blank" -ForegroundColor White
    pause
    exit 1
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   УСПЕШНО! Код отправлен в Hugging Face!                " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Спейс сейчас собирается в облаке (обычно 1-2 минуты)." -ForegroundColor Cyan
Write-Host ""
Write-Host "Страница сборки и логов:" -ForegroundColor Yellow
Write-Host "  https://huggingface.co/spaces/${Username}/${SpaceName}" -ForegroundColor White
Write-Host ""
Write-Host "Прямой адрес вашего YarGram (HTTPS):" -ForegroundColor Yellow
Write-Host "  https://${Username}-${SpaceName}.hf.space/app" -ForegroundColor Cyan
Write-Host "  https://${Username}-${SpaceName}.hf.space" -ForegroundColor Cyan
Write-Host ""
Write-Host "Компьютер можно выключать — сервер работает 24/7 в облаке!" -ForegroundColor Green
Write-Host ""
pause
