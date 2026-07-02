package com.standupsync.controller;

import com.standupsync.dto.Result;
import com.standupsync.dto.TodoCreateDTO;
import com.standupsync.service.TodoService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/todos")
public class TodoController {

    private final TodoService todoService;

    public TodoController(TodoService todoService) {
        this.todoService = todoService;
    }

    @GetMapping
    public Result<?> list(@RequestParam Long teamId, Authentication auth) {
        return todoService.getTodos(teamId, (Long) auth.getPrincipal());
    }

    @GetMapping("/mine")
    public Result<?> mine(Authentication auth) {
        return todoService.getMyTodos((Long) auth.getPrincipal());
    }

    @PostMapping
    public Result<?> create(@RequestBody TodoCreateDTO dto, Authentication auth) {
        return todoService.createTodo(dto, (Long) auth.getPrincipal());
    }

    @PatchMapping("/{id}/status")
    public Result<?> updateStatus(@PathVariable Long id, @RequestParam String status, Authentication auth) {
        return todoService.updateStatus(id, status, (Long) auth.getPrincipal());
    }

    @GetMapping("/unfinished")
    public Result<?> unfinished(Authentication auth) {
        return todoService.getUnfinishedTodos((Long) auth.getPrincipal());
    }

    @PostMapping("/{id}/transfer")
    public Result<?> requestTransfer(@PathVariable Long id, @RequestParam Long newAssigneeId, Authentication auth) {
        return todoService.requestTransfer(id, newAssigneeId, (Long) auth.getPrincipal());
    }

    @PostMapping("/{id}/transfer/approve")
    public Result<?> approveTransfer(@PathVariable Long id, Authentication auth) {
        return todoService.approveTransfer(id, (Long) auth.getPrincipal());
    }

    @PostMapping("/generate/{standupId}")
    public Result<?> generateFromAI(@PathVariable Long standupId, Authentication auth) {
        return todoService.generateFromActionItems(standupId, (Long) auth.getPrincipal());
    }
}
