@echo off
set CLOUDSDK_PYTHON=C:\Users\matth\AppData\Local\Programs\Python\Python312\python.exe
gcloud run deploy fire-leads-processor --source C:\Users\matth\cloud-fn-fire-leads --region us-central1 --no-invoker-iam-check --set-env-vars "XCELERATE_API_KEY=ee30f26088697fd9e1f8e8857d90aba60e6fc8422f05a0c79b5c06791c809a51,GCS_BUCKET=packouts-gchat-tokens" --quiet
