"""A disposable native window for release-EXE z-order regression tests."""
import ctypes as c
from ctypes import wintypes as w
import json
import queue
import sys
import threading
import time

user = c.WinDLL("user32", use_last_error=True)
user.SetProcessDPIAware()
callback = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
user.EnumWindows.argtypes = [callback, w.LPARAM]
user.GetWindowThreadProcessId.argtypes = [w.HWND, c.POINTER(w.DWORD)]
user.GetWindowTextW.argtypes = [w.HWND, w.LPWSTR, c.c_int]
user.GetWindowRect.argtypes = [w.HWND, c.POINTER(w.RECT)]
user.GetWindowLongW.argtypes = [w.HWND, c.c_int]
user.IsWindowVisible.argtypes = [w.HWND]
user.IsIconic.argtypes = [w.HWND]
user.GetWindow.argtypes = [w.HWND, w.UINT]
user.GetWindow.restype = w.HWND
user.GetForegroundWindow.restype = w.HWND
user.SetForegroundWindow.argtypes = [w.HWND]
user.CreateWindowExW.argtypes = [
    w.DWORD, w.LPCWSTR, w.LPCWSTR, w.DWORD, c.c_int, c.c_int, c.c_int,
    c.c_int, w.HWND, w.HMENU, w.HINSTANCE, w.LPVOID,
]
user.CreateWindowExW.restype = w.HWND
user.SetWindowPos.argtypes = [
    w.HWND, w.HWND, c.c_int, c.c_int, c.c_int, c.c_int, w.UINT,
]
user.ShowWindow.argtypes = [w.HWND, c.c_int]
user.DestroyWindow.argtypes = [w.HWND]
user.PeekMessageW.argtypes = [c.POINTER(w.MSG), w.HWND, w.UINT, w.UINT, w.UINT]
user.TranslateMessage.argtypes = [c.POINTER(w.MSG)]
user.DispatchMessageW.argtypes = [c.POINTER(w.MSG)]
user.DispatchMessageW.restype = c.c_ssize_t

pid = int(sys.argv[1])
fixture = None


def snapshot():
    rows = []

    @callback
    def inspect(hwnd, _):
        found = w.DWORD()
        user.GetWindowThreadProcessId(hwnd, c.byref(found))
        if found.value != pid and hwnd != fixture:
            return True
        title = c.create_unicode_buffer(256)
        user.GetWindowTextW(hwnd, title, len(title))
        if hwnd != fixture and title.value not in ["小鲸鱼", "Whale tableware"]:
            return True
        rect = w.RECT()
        user.GetWindowRect(hwnd, c.byref(rect))
        rows.append({
            "title": "fixture" if hwnd == fixture else title.value,
            "hwnd": hwnd, "owner": user.GetWindow(hwnd, 4),
            "topmost": bool(user.GetWindowLongW(hwnd, -20) & 8),
            "visible": bool(user.IsWindowVisible(hwnd)),
            "minimized": bool(user.IsIconic(hwnd)),
            "rect": [rect.left, rect.top, rect.right, rect.bottom],
        })
        return True

    user.EnumWindows(inspect, 0)
    return {"windows": rows, "foreground": user.GetForegroundWindow()}


def command(data):
    global fixture
    action = data["action"]
    if action in ["normal", "topmost", "away"]:
        pet = next(row for row in snapshot()["windows"] if row["title"] == "小鲸鱼")
        x, y, right, bottom = pet["rect"]
        if action == "away":
            x, y = -20000, -20000
        if fixture:
            user.DestroyWindow(fixture)
            fixture = None
        if fixture is None:
            fixture = user.CreateWindowExW(
                0x80 | (0 if action == "normal" else 8),
                "STATIC", "Whale z-order regression fixture", 0x80000000,
                x, y, right - pet["rect"][0], bottom - pet["rect"][1],
                None, None, None, None,
            )
            if not fixture:
                raise c.WinError(c.get_last_error())
        insert = -2 if action == "normal" else -1
        if not user.SetWindowPos(
            fixture, insert, x, y, right - pet["rect"][0],
            bottom - pet["rect"][1], 0x10 | 0x40,
        ):
            raise c.WinError(c.get_last_error())
    elif action == "hide":
        if fixture:
            user.ShowWindow(fixture, 0)
    elif action == "foreground":
        if fixture:
            user.SetForegroundWindow(fixture)
    elif action != "snapshot":
        raise ValueError(action)
    return snapshot()


commands = queue.Queue()


def read_commands():
    for line in sys.stdin:
        commands.put(json.loads(line))
    commands.put({"action": "quit"})


def hold_for_ui_test():
    commands.put({"action": "topmost"})
    time.sleep(30)
    commands.put({"action": "snapshot"})
    commands.put({"action": "quit"})


threading.Thread(
    target=hold_for_ui_test if "--hold" in sys.argv else read_commands, daemon=True,
).start()
try:
    while True:
        message = w.MSG()
        while user.PeekMessageW(c.byref(message), None, 0, 0, 1):
            user.TranslateMessage(c.byref(message))
            user.DispatchMessageW(c.byref(message))
        try:
            data = commands.get_nowait()
        except queue.Empty:
            time.sleep(0.01)
            continue
        if data["action"] == "quit":
            break
        try:
            result = command(data)
        except Exception as error:
            result = {"error": str(error)}
        print(json.dumps(result, ensure_ascii=True), flush=True)
finally:
    if fixture:
        user.DestroyWindow(fixture)
