package ts_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/ARCoder181105/funcatlas/parser/internal/security"
	"github.com/ARCoder181105/funcatlas/parser/internal/ts"
	"go.uber.org/zap"
)

func TestExtract_Golden(t *testing.T) {
	logger := zap.NewNop()
	cfg := security.ConfigFromEnv()
	root := "../../testdata/golden"

	graph, err := ts.Extract(logger, root, cfg)
	if err != nil {
		t.Fatalf("Extract failed: %v", err)
	}

	actualData, err := json.MarshalIndent(graph, "", "  ")
	if err != nil {
		t.Fatalf("Marshal failed: %v", err)
	}

	actualFile := filepath.Join(t.TempDir(), "extract_actual.json")
	if err := os.WriteFile(actualFile, actualData, 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	expectedData, err := os.ReadFile("../../testdata/golden/extract_expected.json")
	if err != nil {
		t.Fatalf("ReadFile expected failed: %v", err)
	}

	var actual, expected map[string]interface{}
	if err := json.Unmarshal(actualData, &actual); err != nil {
		t.Fatalf("Unmarshal actual failed: %v", err)
	}
	if err := json.Unmarshal(expectedData, &expected); err != nil {
		t.Fatalf("Unmarshal expected failed: %v", err)
	}

	if !reflect.DeepEqual(actual, expected) {
		t.Errorf("Mismatch between actual and expected JSON outputs. See %s", actualFile)
	}
}
