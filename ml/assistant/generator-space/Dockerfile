FROM python:3.12-slim
RUN useradd -m -u 1000 app
WORKDIR /home/app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=app . .
USER app
ENV PYTHONUNBUFFERED=1
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
