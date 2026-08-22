package src

func helper() string {
	return "go"
}

func go_only() string {
	return "only defined in go"
}

func run() string {
	// python_only is defined only in main.py.
	return helper() + python_only()
}
