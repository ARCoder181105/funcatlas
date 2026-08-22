def helper():
    return "python"


def python_only():
    return "only defined in python"


def run():
    # go_only is defined only in main.go. Resolving it would mean crossing a
    # language boundary on a name that is unambiguous everywhere else.
    return helper() + go_only()
