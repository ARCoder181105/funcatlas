package com.example.store;

import java.util.List;
import java.util.function.Supplier;
import static com.example.util.Text.wrap;

public class Repo {
    private final String id;

    public Repo(String id) {
        this.id = id;
    }

    // Two genuine overloads: same name, same class, different signatures.
    // A call to sync() cannot be attributed to one of them by name alone.
    public String sync() {
        return sync(1);
    }

    public String sync(int attempts) {
        return wrap(describe(attempts));
    }

    public Runnable task() {
        return new Runnable() {
            @Override
            public void run() {
                helper();
            }
        };
    }

    public Supplier<String> lazy() {
        return () -> describe(0);
    }

    static String describe(int value) {
        return String.valueOf(value);
    }

    static void helper() {
        System.out.println("helper");
    }

    static class Nested {
        String deep(List<String> items) {
            return items.get(0);
        }
    }
}
