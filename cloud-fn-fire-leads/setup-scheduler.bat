@echo off
set CLOUDSDK_PYTHON=C:\Users\matth\AppData\Local\Programs\Python\Python312\python.exe
gcloud scheduler jobs create http fire-leads-every-2h --location us-central1 --schedule "0 */2 * * *" --uri "https://fire-leads-processor-326811155221.us-central1.run.app/run" --http-method POST --headers "Content-Type=application/json" --message-body "{}" --attempt-deadline 120s --quiet
