@echo off
set CLOUDSDK_PYTHON=C:\Users\matth\AppData\Local\Programs\Python\Python312\python.exe
gcloud scheduler jobs update http fire-leads-every-2h --location us-central1 --schedule "0 */2 * * *" --time-zone "America/Phoenix"
