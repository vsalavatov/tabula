plugins {
  kotlin("multiplatform")
  kotlin("plugin.serialization")
}

kotlin {
  js(IR) {
    browser {
      testTask {
        enabled = false
      }
    }
    nodejs()
  }

  sourceSets {
    val commonMain by getting {
      dependencies {
        implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:${Versions.coroutines}")
        implementation("org.jetbrains.kotlinx:kotlinx-datetime:${Versions.datetime}")
        implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:${Versions.serialization}")
      }
    }
    val commonTest by getting {
      dependencies {
        implementation(kotlin("test"))
        implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:${Versions.coroutines}")
      }
    }
    val jsMain by getting
  }
}
