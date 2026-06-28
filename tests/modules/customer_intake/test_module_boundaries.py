import ast
from pathlib import Path

MODULE_ROOT = Path("src/carobra_rewards/modules/customer_intake")
DOMAIN_ROOT = MODULE_ROOT / "domain"
APPLICATION_ROOT = MODULE_ROOT / "application"


def _iter_python_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.py") if path.is_file())


def _collect_imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imports: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            imports.add(node.module)

    return imports


def test_domain_does_not_depend_on_fastapi_or_sqlalchemy() -> None:
    forbidden_roots = ("fastapi", "sqlalchemy")

    for path in _iter_python_files(DOMAIN_ROOT):
        imports = _collect_imports(path)
        assert not any(
            imported == root or imported.startswith(f"{root}.")
            for imported in imports
            for root in forbidden_roots
        ), path.as_posix()


def test_application_does_not_depend_on_fastapi() -> None:
    forbidden_roots = ("fastapi", "sqlalchemy")

    for path in _iter_python_files(APPLICATION_ROOT):
        imports = _collect_imports(path)
        assert not any(
            imported == root or imported.startswith(f"{root}.")
            for imported in imports
            for root in forbidden_roots
        ), path.as_posix()


def test_module_does_not_import_http_schemas() -> None:
    for path in _iter_python_files(MODULE_ROOT):
        imports = _collect_imports(path)
        assert not any(
            imported == "carobra_rewards.api"
            or imported.startswith("carobra_rewards.api.")
            for imported in imports
        ), path.as_posix()
