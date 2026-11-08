This folder holds local configuration files for Pratala.

The Google Cloud service-account JSON in this folder is a SECRET KEY.
It is listed in .gitignore and must never be committed, pushed, zipped
or shared. If it ever leaks, revoke it in Google Cloud Console:
IAM & Admin > Service Accounts > pratala-near > Keys.

The backend reads it through GCS_KEY_FILE in backend/.env.
