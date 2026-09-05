"""Generate a small test file-tree for scanner/classifier/delete tests.

Only run against a dedicated test directory (safety red line).
"""
import os
import sys


def write(path, size, data=None):
    d = os.path.dirname(path)
    os.makedirs(d, exist_ok=True)
    if data is not None:
        with open(path, "wb") as f:
            f.write(data)
    else:
        with open(path, "wb") as f:
            f.truncate(size)


def build(root):
    """Create files mimicking each category inside root."""
    os.makedirs(root, exist_ok=True)
    write(os.path.join(root, "app.exe"), 2048)                # system ext
    write(os.path.join(root, "app.sys"), 512)                 # system ext
    write(os.path.join(root, "readme.txt"), 512)              # docs
    write(os.path.join(root, "photo.jpg"), 4096)              # docs
    write(os.path.join(root, "archive.zip"), 8192)            # docs
    write(os.path.join(root, "movie.mp4"), 2000000)           # docs (2MB)
    write(os.path.join(root, "bigdata.bin"), 3 * 1024 * 1024) # 3MB

    cache = os.path.join(root, "Cache")
    write(os.path.join(cache, "blob.tmp"), 1024)
    write(os.path.join(cache, "data.part"), 2048)

    write(os.path.join(root, "~$draft.docx"), 128)           # residue pattern
    write(os.path.join(root, "error.log"), 256)              # residue ext

    # duplicate content pair
    dup_a = os.path.join(root, "dup_a.txt")
    dup_b = os.path.join(root, "sub", "dup_b.txt")
    write(dup_a, 0, b"same-content!-123")
    write(dup_b, 0, b"same-content!-123")
    return root


if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else "tests_tmp"
    print(build(root))