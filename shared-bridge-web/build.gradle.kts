plugins {
  kotlin("multiplatform")
  kotlin("plugin.serialization")
}

kotlin {
  js(IR) {
    browser()
    binaries.executable()
    generateTypeScriptDefinitions()
  }

  sourceSets {
    val jsMain by getting {
      dependencies {
        implementation(project(":shared-core"))
        implementation(project(":shared-db"))
        implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:${Versions.coroutines}")
        implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:${Versions.serialization}")
      }
    }
    val jsTest by getting {
      dependencies {
        implementation(kotlin("test"))
        implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:${Versions.coroutines}")
      }
    }
  }
}
