import os
import re

def extract_view(html, view_id):
    # Find start of the view
    match = re.search(f'<div[^>]*id="{view_id}"[^>]*>', html)
    if not match:
        return None, html
    
    start_idx = match.start()
    
    # Use a stack to find the matching closing </div>
    # We will search for '<div' and '</div' after start_idx
    stack = 1
    current_idx = match.end()
    
    while stack > 0 and current_idx < len(html):
        next_div_open = html.find('<div', current_idx)
        next_div_close = html.find('</div', current_idx)
        
        if next_div_close == -1:
            break
            
        if next_div_open != -1 and next_div_open < next_div_close:
            stack += 1
            current_idx = next_div_open + 4
        else:
            stack -= 1
            current_idx = next_div_close + 6 # len('</div') + closing '>'
            # Wait, </div might have spaces before > so let's find >
            close_bracket = html.find('>', current_idx)
            if close_bracket != -1:
                current_idx = close_bracket + 1
    
    view_html = html[start_idx:current_idx]
    
    return view_html, current_idx, start_idx

def main():
    with open('public/index.html', 'r', encoding='utf-8') as f:
        html = f.read()

    views = ['view-dashboard', 'view-history', 'view-actions', 'view-settings']
    
    extracted = {}
    
    # Find the bounds of the views
    # We assume they are contiguous or sequential.
    min_start = len(html)
    max_end = 0
    
    for v in views:
        v_html, end_idx, start_idx = extract_view(html, v)
        if v_html:
            extracted[v] = v_html
            if start_idx < min_start: min_start = start_idx
            if end_idx > max_end: max_end = end_idx
            
            # Write to file
            filename = v.replace('view-', '') + '.html'
            with open(f'public/views/{filename}', 'w', encoding='utf-8') as f:
                f.write(v_html)
            print(f"Extracted {filename}")

    if extracted:
        # Replace the chunk with <main id="main-content"></main>
        new_html = html[:min_start] + '<main id="main-content" class="main-content"></main>' + html[max_end:]
        with open('public/index.html', 'w', encoding='utf-8') as f:
            f.write(new_html)
        print("Updated index.html")
    else:
        print("No views found to extract.")

if __name__ == '__main__':
    main()
