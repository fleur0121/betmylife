FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY ml-api/requirements-odds.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY ml-api/general_model.pkl ./general_model.pkl
COPY ml-api/history_features.py ./history_features.py
COPY ml-api/odds_service.py ./odds_service.py

EXPOSE 8001

CMD ["uvicorn", "odds_service:app", "--host", "0.0.0.0", "--port", "8001"]
