package com.standupsync.controller;

import com.standupsync.dto.Result;
import com.standupsync.service.SprintService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/sprints")
public class SprintController {

    private final SprintService sprintService;

    public SprintController(SprintService sprintService) {
        this.sprintService = sprintService;
    }

    @GetMapping
    public Result<?> list() {
        return sprintService.listAll();
    }

    @PostMapping
    public Result<?> create(@RequestParam String name,
                            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
                            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return sprintService.create(name, startDate, endDate);
    }
}
