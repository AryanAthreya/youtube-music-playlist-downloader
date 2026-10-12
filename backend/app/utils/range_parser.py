"""
HTTP Range header parser utility.
"""


def parse_range_header(
    range_header: str | None,
    file_size: int,
) -> tuple[int, int]:
    """Parse an HTTP Range header and return (start, end) byte offsets.

    Args:
        range_header: Value of the Range header (e.g. 'bytes=0-1023').
        file_size: Total file size in bytes.

    Returns:
        tuple[int, int]: (start, end) byte offsets, both inclusive.

    Raises:
        ValueError: If the Range header is malformed or out of bounds.
    """
    if not range_header:
        return 0, file_size - 1

    if not range_header.startswith("bytes="):
        raise ValueError(f"Unsupported Range unit: {range_header}")

    range_spec = range_header[6:]  # Remove 'bytes='
    parts = range_spec.split("-", 1)
    if len(parts) != 2:
        raise ValueError(f"Malformed Range header: {range_header}")

    start_str, end_str = parts

    if start_str and end_str:
        start, end = int(start_str), int(end_str)
    elif start_str:
        start = int(start_str)
        end = file_size - 1
    elif end_str:
        # Suffix range: last N bytes
        suffix = int(end_str)
        start = max(0, file_size - suffix)
        end = file_size - 1
    else:
        raise ValueError(f"Malformed Range header: {range_header}")

    if start < 0 or end >= file_size or start > end:
        raise ValueError(
            f"Range {start}-{end} is out of bounds for file size {file_size}"
        )

    return start, end
