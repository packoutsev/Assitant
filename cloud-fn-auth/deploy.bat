@echo off
set CLOUDSDK_PYTHON=C:\Users\matth\AppData\Local\Programs\Python\Python312\python.exe
gcloud run deploy auth-service --source . --region us-central1 --no-invoker-iam-check --quiet
