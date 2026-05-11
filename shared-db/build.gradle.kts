plugins {
  kotlin("multiplatform")
  id("app.cash.sqldelight")
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
        api(project(":shared-core"))
        implementation("app.cash.sqldelight:runtime:${Versions.sqldelight}")
        implementation("app.cash.sqldelight:coroutines-extensions:${Versions.sqldelight}")
        implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:${Versions.coroutines}")
        implementation("org.jetbrains.kotlinx:kotlinx-datetime:${Versions.datetime}")
      }
    }
    val commonTest by getting {
      dependencies {
        implementation(kotlin("test"))
        implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:${Versions.coroutines}")
        implementation("app.cash.turbine:turbine:${Versions.turbine}")
      }
    }
    val jsMain by getting {
      dependencies {
        implementation(npm("sql.js", "1.10.3"))
      }
    }
    val jsTest by getting
  }
}

sqldelight {
  databases {
    create("TabulaSharedDatabase") {
      packageName = "${ProjectConfig.group}.${ProjectConfig.artifactId}.shared.db.generated"
      dialect("app.cash.sqldelight:sqlite-3-24-dialect:${Versions.sqldelight}")
      schemaOutputDirectory = file("build/generated/sqldelight/schema")
      migrationOutputDirectory = file("build/generated/sqldelight/migrations")
      deriveSchemaFromMigrations = true
      verifyMigrations = true
    }
  }
}
