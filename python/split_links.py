import os

def main():
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(BASE_DIR, "list.txt")

    print("Reading from:", file_path)

    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    server1 = []
    server2 = []

    for line in lines:
        url = line.strip()

        if not url.endswith(".m3u8"):
            continue

        if "phim1280" in url:
            server1.append(url)
        elif "kkphimplayer" in url:
            server2.append(url)

    with open(os.path.join(BASE_DIR, "server1.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(server1))

    with open(os.path.join(BASE_DIR, "server2.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(server2))

    print("Done!")
    print("Server1:", len(server1))
    print("Server2:", len(server2))


if __name__ == "__main__":
    main()