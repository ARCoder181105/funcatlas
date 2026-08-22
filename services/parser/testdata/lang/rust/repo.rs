use std::fmt::Write as FmtWrite;
use crate::util::{wrap, unwrap as peel};

pub struct Repo {
    id: String,
}

impl Repo {
    pub fn sync(&self) -> String {
        let label = self.label();
        println!("{}", describe(&label));
        wrap(label)
    }

    fn label(&self) -> String {
        peel(self.id.clone())
    }
}

pub fn describe(value: &str) -> String {
    value.to_owned()
}

pub fn apply(values: Vec<i32>) -> Vec<String> {
    values.iter().map(|v| render(*v)).collect()
}

fn render(value: i32) -> String {
    match value {
        0 => empty(),
        _ => describe(&value.to_string()),
    }
}

fn empty() -> String {
    String::new()
}
