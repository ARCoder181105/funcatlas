function localCall() {
    obj.method();
    a.b.c();
    setTimeout(() => {
        innerCall();
    }, 100);
}
a.b.c();
