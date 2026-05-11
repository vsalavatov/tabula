allprojects {
  group = ProjectConfig.group
  version = ProjectConfig.version

  repositories {
    google()
    mavenCentral()
  }
}

buildscript {
  dependencies {
    classpath("app.cash.sqldelight:gradle-plugin:${Versions.sqldelight}")
  }
}

plugins {
  kotlin("multiplatform") version Versions.kotlin apply false
  kotlin("plugin.serialization") version Versions.kotlin apply false
  id("app.cash.sqldelight") version Versions.sqldelight apply false
}
