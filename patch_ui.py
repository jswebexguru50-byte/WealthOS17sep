import re

with open('src/components/StockIntelligenceView.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace numerical and categorical defaults
text = re.sub(r"\|\|\s*'52\.4'", "?? 'N/A'", text)
text = re.sub(r"\|\|\s*'UPTREND'", "?? 'N/A'", text)
text = re.sub(r"\|\|\s*'1\.12'", "?? 'N/A'", text)
text = re.sub(r"\|\|\s*'24\.5'", "?? 'N/A'", text)
text = re.sub(r"\|\|\s*72", "?? 'N/A'", text)
text = re.sub(r"\|\|\s*28", "?? 'N/A'", text)
text = re.sub(r"\|\|\s*'BULLISH_EXPANSION'", "?? 'N/A'", text)
text = re.sub(r"\|\|\s*'ACCUMULATING'", "?? 'N/A'", text)
text = re.sub(r"\|\|\s*'HIGH'", "?? 'N/A'", text)
text = re.sub(r"\|\|\s*'BULLISH'", "?? 'N/A'", text)
text = re.sub(r"\|\|\s*'NEUTRAL'", "?? 'N/A'", text)
text = re.sub(r"\|\|\s*'LONG_BUILD_UP'", "?? 'N/A'", text)

# Layman strings
text = re.sub(r"\|\|\s*'Model indicates strong statistical probability of upward expansion\.'", "?? 'Data unavailable.'", text)
text = re.sub(r"\|\|\s*'Price is oscillating comfortably inside the volatility corridor\.'", "?? 'Data unavailable.'", text)
text = re.sub(r"\|\|\s*'Measures speed and magnitude of recent price moves on a 0-100 scale\.'", "?? 'Data unavailable.'", text)
text = re.sub(r"\|\|\s*'Moving average alignment indicates whether long-term buyers are in control\.'", "?? 'Data unavailable.'", text)
text = re.sub(r"\|\|\s*'Evaluates volatility compression before major directional breakout moves\.'", "?? 'Data unavailable.'", text)
text = re.sub(r"\|\|\s*'Key price milestones where buying or selling interest concentrates\.'", "?? 'Data unavailable.'", text)
text = re.sub(r"\|\|\s*'Ratio of put contracts to call contracts\.'", "?? 'Data unavailable.'", text)
text = re.sub(r"\|\|\s*'Positive derivative tailwind for portfolio\.'", "?? 'Data unavailable.'", text)
text = re.sub(r"\|\|\s*'Position in 52W range'", "?? 'Data unavailable.'", text)
text = re.sub(r"\|\|\s*'Constructive corporate news flow\.'", "?? 'Data unavailable.'", text)

with open('temp_ui.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
