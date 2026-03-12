// Integer math helpers for RedScript datapacks.

fn abs(x: int) -> int {
    if (x < 0) {
        return -x;
    } else {
        return x;
    }
}

fn min(a: int, b: int) -> int {
    if (a < b) {
        return a;
    } else {
        return b;
    }
}

fn max(a: int, b: int) -> int {
    if (a > b) {
        return a;
    } else {
        return b;
    }
}

fn clamp(x: int, lo: int, hi: int) -> int {
    if (x < lo) {
        return lo;
    } else {
        if (x > hi) {
            return hi;
        } else {
            return x;
        }
    }
}

fn sign(x: int) -> int {
    if (x > 0) {
        return 1;
    } else {
        if (x < 0) {
            return -1;
        } else {
            return 0;
        }
    }
}
