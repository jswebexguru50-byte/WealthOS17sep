import os
import subprocess
import sys
from openai import OpenAI

def get_git_diff():
    """Captures the current git diff of the workspace."""
    try:
        # Gets diff of uncommitted changes (staged and unstaged)
        result = subprocess.run(
            ["git", "diff", "HEAD"], 
            capture_output=True, 
            text=True, 
            check=True
        )
        diff = result.stdout.strip()
        if not diff:
            # Fallback to last commit if no active diff
            result = subprocess.run(
                ["git", "show", "HEAD"], 
                capture_output=True, 
                text=True, 
                check=True
            )
            diff = result.stdout.strip()
        return diff
    except subprocess.CalledProcessError as e:
        print(f"Error running git command: {e}")
        sys.exit(1)

def request_chatgpt_review(diff_content):
    """Sends the diff to OpenAI for a structured architectural and security code review."""
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    
    system_prompt = (
        "You are an expert Principal Software Engineer and Security Auditor. "
        "Review the provided code diff. Evaluate it across 4 axes: "
        "1. Correctness & Logic Bugs, 2. Security Vulnerabilities, "
        "3. Performance & Memory Leaks, 4. Maintainability. "
        "Format your output clearly with severity ratings (High, Medium, Low) for each finding, "
        "and provide explicit remediation suggestions."
    )

    print("Sending code diff to ChatGPT for review...")
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Please review this code diff:\n\n```diff\n{diff_content}\n```"}
        ],
        temperature=0.2
    )
    return response.choices[0].message.content

def main():
    if not os.environ.get("OPENAI_API_KEY"):
        print("Error: OPENAI_API_KEY environment variable is missing.")
        sys.exit(1)

    diff = get_git_diff()
    if not diff:
        print("No changes found to review.")
        return

    review_output = request_chatgpt_review(diff)

    # Save review to a markdown file in the workspace
    output_filename = "REVIEW_FEEDBACK.md"
    with open(output_filename, "w", encoding="utf-8") as f:
        f.write("# ChatGPT Independent Code Review\n\n")
        f.write(review_output)

    print(f"Review complete! Feedback successfully written to {output_filename}")

if __name__ == "__main__":
    main()