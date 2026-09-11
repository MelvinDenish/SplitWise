# Render may build from the repository root. The Spring Boot backend lives in
# Splitwise/backend, so this root Dockerfile delegates the build there.
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY Splitwise/backend/pom.xml .
RUN mvn -B -q dependency:go-offline
COPY Splitwise/backend/src ./src
RUN mvn -B -q -DskipTests clean package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
