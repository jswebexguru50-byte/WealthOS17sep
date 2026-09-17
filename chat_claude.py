import boto3
import json
import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "us-west-2")

client = boto3.client(
    "bedrock-runtime",
    region_name=AWS_REGION,
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
)

MODEL_ID = "anthropic.claude-sonnet-4-5-20250929-v1:0"
conversation_history = []

def chat(prompt):
    conversation_history.append({"role": "user", "content": prompt})
    response = client.invoke_model(
        modelId=MODEL_ID,
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "messages": conversation_history
        }),
        contentType="application/json",
        accept="application/json"
    )
    result = json.loads(response["body"].read())
    reply = result["content"][0]["text"]
    conversation_history.append({"role": "assistant", "content": reply})
    return reply

print("=" * 55)
print(f"  Claude (Sonnet) via AWS Bedrock | {AWS_REGION}")
print(f"  Model: {MODEL_ID}")
print("  Type 'exit' or 'quit' to stop | Ctrl+C to abort")
print("=" * 55)

while True:
    try:
        user_input = input("\nYou: ").strip()
        if not user_input:
            continue
        if user_input.lower() in ["exit", "quit"]:
            print("Goodbye!")
            break
        print("\nClaude:", end=" ", flush=True)
        reply = chat(user_input)
        print(reply)
    except KeyboardInterrupt:
        print("\nGoodbye!")
        break
    except Exception as e:
        print(f"\n[Error] {e}")
        break
