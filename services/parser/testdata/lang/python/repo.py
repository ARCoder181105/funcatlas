import functools
import os.path as osp
from .util import wrap, unwrap as peel


def trace(fn):
    @functools.wraps(fn)
    def inner(*args):
        return fn(*args)

    return inner


class Repo:
    def __init__(self, ident):
        self.ident = ident

    @trace
    def sync(self):
        label = self.label()
        return wrap(f"{describe(label)}")

    def label(self):
        return peel(self.ident)

    class Nested:
        def deep(self):
            return describe("nested")


async def fetch(repo):
    return await repo.sync()


def describe(value):
    return str(value)


def apply(values):
    return [render(v) for v in values if keep(v)]


def render(value):
    return osp.basename(str(value))


def keep(value):
    return bool(value)
