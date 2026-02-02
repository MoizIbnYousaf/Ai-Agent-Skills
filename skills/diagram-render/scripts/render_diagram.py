#!/usr/bin/env python3
# /// script
# requires-python = ">=3.9"
# dependencies = [
#     "requests>=2.28.0",
# ]
# ///
"""
Diagram Renderer - Standalone script to render PlantUML, Mermaid, and Graphviz diagrams.

Migrated from mcp-diagram-server for local use without MCP dependency.

Usage:
    # Render PlantUML from file
    python render_diagram.py plantuml -i diagram.puml -o output.png

    # Render PlantUML from stdin
    echo '@startuml\nA->B\n@enduml' | python render_diagram.py plantuml -o output.png

    # Render Mermaid
    python render_diagram.py mermaid -i diagram.mmd -o output.png

    # Render Graphviz
    python render_diagram.py graphviz -i diagram.dot -o output.png

    # Output to stdout (base64)
    python render_diagram.py plantuml -i diagram.puml --base64

Requirements:
    - requests (for PlantUML public server)
    - graphviz (optional, for local Graphviz rendering)
    - mermaid-cli (optional, for local Mermaid rendering)
"""

import argparse
import base64
import os
import shutil
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

# -------------------- PlantUML Encoder --------------------
# PlantUML server expects diagram text compressed (deflate) and encoded in a custom base64.

_ENCODE_TABLE = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"


def _plantuml_encode(data: bytes) -> str:
    """Custom base64 encoding for PlantUML using 6-bit groups."""
    res = []
    bit_buf = 0
    bit_len = 0
    for b in data:
        bit_buf = (bit_buf << 8) | b
        bit_len += 8
        while bit_len >= 6:
            bit_len -= 6
            idx = (bit_buf >> bit_len) & 0x3F
            res.append(_ENCODE_TABLE[idx])
    if bit_len > 0:
        idx = (bit_buf << (6 - bit_len)) & 0x3F
        res.append(_ENCODE_TABLE[idx])
    return ''.join(res)


def plantuml_text_to_key(text: str) -> str:
    """Encode PlantUML text for server URL."""
    comp = zlib.compressobj(level=9, wbits=-15)
    raw = comp.compress(text.encode('utf-8')) + comp.flush()
    return _plantuml_encode(raw)


# -------------------- Rendering Functions --------------------

def render_plantuml(text: str, fmt: str = "png") -> bytes:
    """
    Render PlantUML using the public PlantUML server.
    
    Args:
        text: PlantUML source code
        fmt: Output format ('png' or 'svg')
    
    Returns:
        Raw bytes of the rendered image
    """
    try:
        import requests
    except ImportError:
        raise RuntimeError("'requests' package required. Install with: pip install requests")
    
    key = plantuml_text_to_key(text)
    server = os.environ.get('PLANTUML_SERVER', 'https://www.plantuml.com/plantuml')
    url = f"{server}/{fmt}/{key}"
    
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        return resp.content
    except requests.exceptions.SSLError:
        # Fallback: try with SSL verification disabled (not recommended for production)
        print("Warning: SSL verification failed, retrying without verification...", file=sys.stderr)
        resp = requests.get(url, timeout=30, verify=False)
        resp.raise_for_status()
        return resp.content


def render_graphviz(dot_src: str, fmt: str = 'png') -> bytes:
    """
    Render Graphviz DOT source to image.
    
    Tries python-graphviz first, falls back to dot binary.
    
    Args:
        dot_src: Graphviz DOT source code
        fmt: Output format ('png' or 'svg')
    
    Returns:
        Raw bytes of the rendered image
    """
    try:
        # Prefer python-graphviz if available
        from graphviz import Source
        src = Source(dot_src)
        return src.pipe(format=fmt)
    except ImportError:
        pass
    except Exception as e:
        print(f"Warning: python-graphviz failed: {e}, trying dot binary...", file=sys.stderr)
    
    # Fallback to dot binary
    dot_bin = shutil.which('dot')
    if not dot_bin:
        raise RuntimeError(
            'Graphviz not available. Install with:\n'
            '  - macOS: brew install graphviz\n'
            '  - Ubuntu: apt install graphviz\n'
            '  - Python: pip install graphviz'
        )
    
    proc = subprocess.Popen(
        [dot_bin, f'-T{fmt}'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    out, err = proc.communicate(dot_src.encode('utf-8'))
    
    if proc.returncode != 0:
        raise RuntimeError(f'dot failed: {err.decode()}')
    
    return out


def render_mermaid(mmd_text: str, fmt: str = 'png') -> bytes:
    """
    Render Mermaid diagram using mermaid-cli (mmdc).
    
    Args:
        mmd_text: Mermaid source code
        fmt: Output format ('png' or 'svg')
    
    Returns:
        Raw bytes of the rendered image
    """
    # Find mmdc: try local binary, then npx
    mmdc_bin = shutil.which('mmdc')
    use_npx = False
    
    if not mmdc_bin:
        npx_bin = shutil.which('npx')
        if npx_bin:
            mmdc_bin = npx_bin
            use_npx = True
        else:
            raise RuntimeError(
                'mermaid-cli (mmdc) not found. Install with:\n'
                '  npm install -g @mermaid-js/mermaid-cli\n'
                'Or ensure npx is available.'
            )
    
    with tempfile.TemporaryDirectory() as td:
        in_file = os.path.join(td, 'diagram.mmd')
        out_file = os.path.join(td, f'out.{fmt}')
        
        with open(in_file, 'w', encoding='utf-8') as f:
            f.write(mmd_text)
        
        if use_npx:
            cmd = [mmdc_bin, '@mermaid-js/mermaid-cli', '-i', in_file, '-o', out_file, '-t', 'default']
        else:
            cmd = [mmdc_bin, '-i', in_file, '-o', out_file, '-t', 'default']
        
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        _, err = proc.communicate()
        
        if proc.returncode != 0:
            raise RuntimeError(f'mmdc failed: {err.decode()}')
        
        with open(out_file, 'rb') as f:
            return f.read()


# -------------------- Main CLI --------------------

def main():
    parser = argparse.ArgumentParser(
        description='Render diagrams (PlantUML, Mermaid, Graphviz) to images.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
    # Render PlantUML from file
    python render_diagram.py plantuml -i diagram.puml -o output.png

    # Render from stdin
    cat diagram.puml | python render_diagram.py plantuml -o output.png

    # Render Mermaid
    python render_diagram.py mermaid -i flow.mmd -o flow.png

    # Render Graphviz
    python render_diagram.py graphviz -i graph.dot -o graph.svg -f svg

    # Output base64 to stdout
    python render_diagram.py plantuml -i diagram.puml --base64
'''
    )
    
    parser.add_argument(
        'type',
        choices=['plantuml', 'mermaid', 'graphviz', 'dot'],
        help='Diagram type (dot is alias for graphviz)'
    )
    parser.add_argument(
        '-i', '--input',
        help='Input file (reads from stdin if not specified)'
    )
    parser.add_argument(
        '-o', '--output',
        help='Output file (required unless --base64 is used)'
    )
    parser.add_argument(
        '-f', '--format',
        choices=['png', 'svg'],
        default='png',
        help='Output format (default: png)'
    )
    parser.add_argument(
        '--base64',
        action='store_true',
        help='Output base64-encoded image to stdout instead of file'
    )
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Verbose output'
    )
    
    args = parser.parse_args()
    
    # Validate arguments
    if not args.output and not args.base64:
        parser.error("Either -o/--output or --base64 is required")
    
    # Read input
    if args.input:
        with open(args.input, 'r', encoding='utf-8') as f:
            text = f.read()
    else:
        text = sys.stdin.read()
    
    if not text.strip():
        print("Error: Empty input", file=sys.stderr)
        sys.exit(1)
    
    if args.verbose:
        print(f"Rendering {args.type} diagram ({len(text)} chars) to {args.format}...", file=sys.stderr)
    
    # Render
    try:
        if args.type == 'plantuml':
            data = render_plantuml(text, args.format)
        elif args.type == 'mermaid':
            data = render_mermaid(text, args.format)
        elif args.type in ('graphviz', 'dot'):
            data = render_graphviz(text, args.format)
        else:
            print(f"Error: Unknown diagram type: {args.type}", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Output
    if args.base64:
        print(base64.b64encode(data).decode('ascii'))
    else:
        # Ensure output directory exists
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(args.output, 'wb') as f:
            f.write(data)
        
        if args.verbose:
            print(f"Saved to: {args.output} ({len(data)} bytes)", file=sys.stderr)


if __name__ == '__main__':
    main()
