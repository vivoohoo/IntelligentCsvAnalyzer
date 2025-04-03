{pkgs}: {
  deps = [
    pkgs.taskflow
    pkgs.rapidfuzz-cpp
    pkgs.glibcLocales
    pkgs.postgresql
    pkgs.openssl
  ];
}
